import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";

export const CHAT_DB_FILENAME = "chat.db";

export const chatJournal = sqliteTable(
	"chat_journal",
	{
		sessionId: text("session_id").notNull(),
		epoch: text().notNull(),
		seq: integer().notNull(),
		ts: integer().notNull(),
		eventJson: text("event_json").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.sessionId, table.epoch, table.seq] }),
	],
);

export const chatSessionsLocal = sqliteTable(
	"chat_sessions_local",
	{
		sessionId: text("session_id").primaryKey(),
		scopeId: text("scope_id").notNull(),
		harness: text().notNull(),
		harnessSessionId: text("harness_session_id"),
		epoch: text().notNull(),
		status: text().notNull(),
		title: text(),
		queuedCount: integer("queued_count").notNull().default(0),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => [index("chat_sessions_local_scope_id_idx").on(table.scopeId)],
);

export const chatCommandReceipts = sqliteTable("chat_command_receipts", {
	commandKey: text("command_key").primaryKey(),
	parametersHash: text("parameters_hash").notNull(),
	resultJson: text("result_json").notNull(),
	createdAt: integer("created_at").notNull(),
});

export const chatManagedOperations = sqliteTable(
	"chat_managed_operations",
	{
		operationId: text("operation_id").primaryKey(),
		parametersHash: text("parameters_hash").notNull(),
		sessionId: text("session_id").notNull().unique(),
		scopeId: text("scope_id").notNull(),
		harness: text().notNull(),
		accountRef: text("account_ref"),
		targetKey: text("target_key"),
		providerSessionId: text("provider_session_id"),
		providerTurnId: text("provider_turn_id"),
		state: text().notNull(),
		outcome: text(),
		quiescent: integer({ mode: "boolean" }).notNull().default(false),
		promptState: text("prompt_state").notNull().default("pending"),
		reportJson: text("report_json"),
		error: text(),
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => [
		index("chat_managed_operations_session_id_idx").on(table.sessionId),
		index("chat_managed_operations_scope_id_idx").on(table.scopeId),
	],
);

export const chatManagedInputs = sqliteTable(
	"chat_managed_inputs",
	{
		inputId: text("input_id").primaryKey(),
		operationId: text("operation_id").notNull(),
		providerRequestId: text("provider_request_id").notNull(),
		kind: text().notNull(),
		question: text().notNull(),
		optionsJson: text("options_json"),
		status: text().notNull(),
		answer: text(),
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => [
		index("chat_managed_inputs_operation_id_idx").on(table.operationId),
	],
);

export type JournalRow = typeof chatJournal.$inferSelect;
export type ChatSessionRow = typeof chatSessionsLocal.$inferSelect;
export type ManagedOperationRow = typeof chatManagedOperations.$inferSelect;
export type ManagedInputRow = typeof chatManagedInputs.$inferSelect;
export type CommandReceiptRow = typeof chatCommandReceipts.$inferSelect;
