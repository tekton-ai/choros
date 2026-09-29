import { randomUUID } from "node:crypto";
import type { Turn, UserContent } from "@choros/chat/protocol";
import type { OpenChatDb } from "../../db";
import { EventQueue } from "../../harness/event-queue";
import type {
	AdapterEvent,
	HarnessAdapter,
	HarnessStartOptions,
	HarnessToolDefinition,
} from "../../harness/types";
import { type ChatRuntime, createChatRuntime } from "../../index";
import type { HarnessRegistry } from "../../sessions";

export type ManagedExecutionFixtureOptions = {
	providerSessionId?: string;
	question?: string;
	report(answer: string): unknown;
};

export type ManagedExecutionFixtureRuntimeOptions =
	ManagedExecutionFixtureOptions & {
		dataDir: string;
		migrationsFolder?: string;
		openDatabase?: OpenChatDb;
	};

export function createManagedExecutionFixtureRuntime(
	options: ManagedExecutionFixtureRuntimeOptions,
): ChatRuntime {
	const harnesses: HarnessRegistry = new Map([
		["claude-code", () => new ManagedExecutionFixtureHarness(options)],
		["codex", () => new ManagedExecutionFixtureHarness(options)],
	]);
	return createChatRuntime({
		dataDir: options.dataDir,
		migrationsFolder: options.migrationsFolder,
		harnesses,
		openDatabase: options.openDatabase,
	});
}

/**
 * Deterministic provider-protocol fixture. It exists only under the testing
 * export and drives the same controlled tool handlers as Claude/Codex: input,
 * report, terminal turn, and cancellation. Production registries never mount
 * it and there is no environment switch that enables it.
 */
export class ManagedExecutionFixtureHarness implements HarnessAdapter {
	private readonly queue = new EventQueue();
	private startOptions: HarnessStartOptions | null = null;
	private turn: Turn | null = null;
	private canceled = false;
	private disposed = false;
	private providerSessionId: string;

	constructor(private readonly options: ManagedExecutionFixtureOptions) {
		this.providerSessionId = options.providerSessionId ?? randomUUID();
	}

	start(options: HarnessStartOptions): AsyncIterable<AdapterEvent> {
		this.startOptions = options;
		if (options.resume)
			this.providerSessionId = options.resume.harnessSessionId;
		this.queue.push({
			kind: "session",
			session: {
				status: "idle",
				harnessSessionId: this.providerSessionId,
			},
		});
		return this.queue.iterable();
	}

	prompt(_content: UserContent[]): void {
		queueMicrotask(() => void this.runTurn());
	}

	cancelTurn(): void {
		if (!this.turn || this.turn.status !== "running") return;
		this.canceled = true;
		this.turn = {
			...this.turn,
			status: "interrupted",
			completedAtMs: Date.now(),
		};
		this.queue.push({ kind: "turn", turn: this.turn });
	}

	respondToApproval(): void {
		throw new Error(
			"managed execution fixture has no native permission request",
		);
	}

	setMode(modeId: string): void {
		this.queue.push({ kind: "session", session: { modeId } });
	}

	async dispose(): Promise<{ quiescent: boolean }> {
		this.disposed = true;
		this.cancelTurn();
		this.queue.close();
		return { quiescent: true };
	}

	private async runTurn(): Promise<void> {
		const turnId = randomUUID();
		this.turn = { id: turnId, status: "running", startedAtMs: Date.now() };
		this.queue.push({ kind: "turn", turn: this.turn });
		try {
			const requestInput = this.tool("request_input");
			const answerResult = (await requestInput.handler(
				{ question: this.options.question ?? "Continue?" },
				{
					callId: randomUUID(),
					providerSessionId: this.providerSessionId,
					providerTurnId: turnId,
				},
			)) as { answer?: unknown };
			if (this.canceled || this.disposed) return;
			const answer = String(answerResult.answer ?? "");
			const reportResult = this.tool("report_result");
			await reportResult.handler(
				{ requestId: randomUUID(), report: this.options.report(answer) },
				{
					callId: randomUUID(),
					providerSessionId: this.providerSessionId,
					providerTurnId: turnId,
				},
			);
			if (this.canceled || this.disposed) return;
			this.turn = {
				...this.turn,
				status: "completed",
				completedAtMs: Date.now(),
			};
			this.queue.push({ kind: "turn", turn: this.turn });
		} catch (error) {
			if (this.canceled || this.disposed) return;
			this.turn = {
				...this.turn,
				status: "failed",
				error: {
					message: error instanceof Error ? error.message : String(error),
				},
				completedAtMs: Date.now(),
			};
			this.queue.push({ kind: "turn", turn: this.turn });
		}
	}

	private tool(name: string): HarnessToolDefinition {
		const tool = this.startOptions?.tools?.find(
			(candidate) => candidate.name === name,
		);
		if (!tool) throw new Error(`controlled tool ${name} is not registered`);
		return tool;
	}
}
