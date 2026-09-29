import type { Envelope } from "@choros/chat/protocol";
import type {
	HarnessAdapter,
	HarnessObserver,
	HarnessToolDefinition,
} from "../../harness";
import type { ChatJournal } from "../../journal";
import { LiveSession } from "../live-session";

export type HarnessFactoryOptions = {
	sessionId: string;
	scopeId: string;
	harness: string;
	cwd: string;
	modeId?: string;
	modelId?: string;
	resume?: { harnessSessionId: string };
	env?: Record<string, string>;
	instructions?: string;
	tools?: HarnessToolDefinition[];
	observer?: HarnessObserver;
};

export type HarnessFactory = (options: HarnessFactoryOptions) => HarnessAdapter;

export type HarnessRegistry = Map<string, HarnessFactory>;

export type LiveSessionRegistryOptions = {
	journal: ChatJournal;
	publish: (envelope: Envelope) => void;
	harnesses: HarnessRegistry;
	mintId?: () => string;
	now?: () => number;
	defaultTools?(options: HarnessFactoryOptions): HarnessToolDefinition[];
};

export class LiveSessionRegistry {
	private readonly live = new Map<string, LiveSession>();

	constructor(private readonly options: LiveSessionRegistryOptions) {}

	supports(harness: string): boolean {
		return this.options.harnesses.has(harness);
	}

	create(options: HarnessFactoryOptions): LiveSession {
		const factory = this.options.harnesses.get(options.harness);
		if (!factory) throw new Error(`unknown harness ${options.harness}`);
		if (this.live.has(options.sessionId)) {
			throw new Error(`chat session ${options.sessionId} is already running`);
		}

		const session = new LiveSession({
			sessionId: options.sessionId,
			scopeId: options.scopeId,
			harness: options.harness,
			journal: this.options.journal,
			publish: this.options.publish,
			adapter: factory(options),
			mintId: this.options.mintId,
			now: this.options.now,
		});
		this.live.set(options.sessionId, session);
		try {
			session.start({
				cwd: options.cwd,
				modeId: options.modeId,
				modelId: options.modelId,
				resume: options.resume,
				env: options.env,
				instructions: options.instructions,
				tools: options.tools ?? this.options.defaultTools?.(options),
				observer: options.observer,
			});
		} catch (error) {
			this.live.delete(options.sessionId);
			void session.dispose().catch(() => undefined);
			throw error;
		}
		return session;
	}

	get(sessionId: string): LiveSession | null {
		return this.live.get(sessionId) ?? null;
	}

	require(sessionId: string): LiveSession {
		const session = this.live.get(sessionId);
		if (!session) throw new Error(`chat session ${sessionId} is not running`);
		return session;
	}

	async dispose(sessionId: string): Promise<{ quiescent: boolean }> {
		const session = this.live.get(sessionId);
		if (!session) return { quiescent: false };
		const result = await session.dispose();
		if (this.live.get(sessionId) === session) this.live.delete(sessionId);
		return result;
	}

	async disposeAll(): Promise<void> {
		const sessions = [...this.live.values()];
		const results = await Promise.allSettled(
			sessions.map((session) => session.dispose()),
		);
		for (const session of sessions) {
			if (this.live.get(session.sessionId) === session) {
				this.live.delete(session.sessionId);
			}
		}
		const failure = results.find((result) => result.status === "rejected");
		if (failure?.status === "rejected") throw failure.reason;
	}
}
