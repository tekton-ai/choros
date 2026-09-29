import type { ChatCommands } from "./commands";
import { CommandDedupe, createCommands } from "./commands";
import type { ChatDb, OpenChatDb } from "./db";
import { createChatDb } from "./db";
import type { HarnessToolDefinition } from "./harness";
import { ChatJournal } from "./journal";
import { ManagedChatOperations } from "./managed-operations";
import { ChatSessionStore } from "./projection";
import type { HarnessFactoryOptions, HarnessRegistry } from "./sessions";
import { LiveSessionRegistry } from "./sessions";
import type { Schedule, Sink, SubscribeOptions, Subscription } from "./stream";
import { SubscriptionHub } from "./stream";

export * from "./commands";
export * from "./db";
export * from "./harness";
export * from "./journal";
export * from "./managed-operations";
export * from "./projection";
export * from "./replay";
export * from "./router";
export * from "./sessions";
export * from "./stream";

export type ChatRuntimeOptions = {
	dataDir: string;
	migrationsFolder?: string;
	openDatabase?: OpenChatDb;
	harnesses?: HarnessRegistry;
	schedule?: Schedule;
	bootstrapLimit?: number;
	dedupeCapacity?: number;
	interactiveTools?: (
		context: HarnessFactoryOptions,
	) => HarnessToolDefinition[];
};

export type ChatRuntime = {
	journal: ChatJournal;
	sessions: ChatSessionStore;
	db: ChatDb;
	live: LiveSessionRegistry;
	subscriptions: SubscriptionHub;
	commands: ChatCommands;
	operations: ManagedChatOperations;
	subscribe(
		sessionId: string,
		options: SubscribeOptions,
		sink: Sink,
	): Subscription;
	dispose(): Promise<void>;
};

export function createChatRuntime(options: ChatRuntimeOptions): ChatRuntime {
	const db = (options.openDatabase ?? createChatDb)({
		dataDir: options.dataDir,
		migrationsFolder: options.migrationsFolder,
	});
	const journal = new ChatJournal(db);
	const sessions = new ChatSessionStore(db);
	const subscriptions = new SubscriptionHub(db, {
		schedule: options.schedule,
		bootstrapLimit: options.bootstrapLimit,
	});
	const live = new LiveSessionRegistry({
		journal,
		publish: (envelope) => subscriptions.publish(envelope),
		harnesses: options.harnesses ?? new Map(),
		defaultTools: options.interactiveTools,
	});
	const operations = new ManagedChatOperations({ db, journal, sessions, live });
	const commands = createCommands({
		journal,
		db,
		sessions,
		live,
		operations,
		dedupe: new CommandDedupe(options.dedupeCapacity, db),
	});
	return {
		journal,
		sessions,
		db,
		live,
		subscriptions,
		commands,
		operations,
		subscribe: (sessionId, subscribeOptions, sink) =>
			subscriptions.subscribe(sessionId, subscribeOptions, sink),
		dispose: async () => {
			try {
				await live.disposeAll();
			} finally {
				try {
					subscriptions.dispose();
				} finally {
					db.$client.close();
				}
			}
		},
	};
}
