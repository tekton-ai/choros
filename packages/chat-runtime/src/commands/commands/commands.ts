import { randomUUID } from "node:crypto";
import type {
	CancelTurnInput,
	Cursor,
	GetItemsInput,
	GetSessionInput,
	PromptInput,
	RespondToApprovalInput,
	SetModeInput,
} from "@choros/chat/protocol";
import {
	cancelTurnInputSchema,
	createSessionInputSchema,
	getItemsInputSchema,
	getSessionInputSchema,
	listSessionsInputSchema,
	promptInputSchema,
	respondToApprovalInputSchema,
	setModeInputSchema,
} from "@choros/chat/protocol";
import { z } from "zod";
import type { ChatDb, ChatSessionRow } from "../../db";
import type { ChatJournal } from "../../journal";
import type { ManagedChatOperations } from "../../managed-operations";
import type { ChatSessionStore } from "../../projection";
import type { PageResult } from "../../replay";
import { readPage } from "../../replay";
import type { LiveSessionRegistry, PromptResult } from "../../sessions";

export const createSessionCommandSchema = createSessionInputSchema
	.omit({ workspaceId: true })
	.extend({ scopeId: z.string().min(1), cwd: z.string().min(1) });
export type CreateSessionCommandInput = z.input<
	typeof createSessionCommandSchema
>;

export const listSessionsCommandSchema = listSessionsInputSchema
	.omit({ workspaceId: true })
	.extend({ scopeId: z.string().min(1).optional() });
export type ListSessionsCommandInput = z.input<
	typeof listSessionsCommandSchema
>;

export type CreateSessionResult = {
	sessionId: string;
	epoch: string;
};

export type GetSessionResult = {
	session: ChatSessionRow | null;
	cursor: Cursor | null;
};

export type ChatCommands = {
	createSession(input: CreateSessionCommandInput): CreateSessionResult;
	prompt(input: PromptInput): PromptResult;
	cancelTurn(input: CancelTurnInput): void;
	respondToApproval(input: RespondToApprovalInput): void;
	setMode(input: SetModeInput): void;
	getSession(input: GetSessionInput): GetSessionResult;
	listSessions(input: ListSessionsCommandInput): ChatSessionRow[];
	getItems(input: z.input<typeof getItemsInputSchema>): PageResult;
};

export type CommandsOptions = {
	journal: ChatJournal;
	db: ChatDb;
	sessions: ChatSessionStore;
	live: LiveSessionRegistry;
	operations?: ManagedChatOperations;
	dedupe: {
		run<T>(commandId: string, execute: () => T): T;
		run<T>(commandId: string, parameters: unknown, execute: () => T): T;
	};
	mintSessionId?: () => string;
};

export function createCommands(options: CommandsOptions): ChatCommands {
	const mintSessionId = options.mintSessionId ?? randomUUID;

	const rejectManagedSession = (sessionId: string): void => {
		const operation = options.operations?.findBySession(sessionId);
		if (operation) {
			throw new Error(
				`chat session ${sessionId} is owned by managed operation ${operation.operationId}`,
			);
		}
	};

	const listSessions = (input: ListSessionsCommandInput): ChatSessionRow[] => {
		const parsed = listSessionsCommandSchema.parse(input);
		const rows = parsed.scopeId
			? options.sessions.listByScope(parsed.scopeId)
			: options.sessions.list();
		return rows.slice(0, parsed.limit);
	};

	return {
		createSession(input) {
			const parsed = createSessionCommandSchema.parse(input);
			return options.dedupe.run(
				`createSession:${parsed.commandId}`,
				parsed,
				() => {
					if (!options.live.supports(parsed.harness)) {
						throw new Error(`unknown harness ${parsed.harness}`);
					}
					const sessionId = mintSessionId();
					const opened = options.journal.open({
						sessionId,
						scopeId: parsed.scopeId,
						harness: parsed.harness,
					});
					try {
						options.live.create({
							sessionId,
							scopeId: parsed.scopeId,
							harness: parsed.harness,
							cwd: parsed.cwd,
							modeId: parsed.modeId,
							modelId: parsed.modelId,
						});
					} catch (error) {
						options.journal.discard(sessionId);
						throw error;
					}
					return { sessionId, epoch: opened.epoch };
				},
			);
		},

		prompt(input) {
			const parsed: PromptInput = promptInputSchema.parse(input);
			rejectManagedSession(parsed.sessionId);
			return options.dedupe.run(`prompt:${parsed.commandId}`, parsed, () =>
				options.live
					.require(parsed.sessionId)
					.prompt(parsed.content, parsed.clientId),
			);
		},

		cancelTurn(input) {
			const parsed: CancelTurnInput = cancelTurnInputSchema.parse(input);
			options.dedupe.run(`cancelTurn:${parsed.commandId}`, parsed, () => {
				options.live.require(parsed.sessionId).cancelTurn(parsed.turnId);
			});
		},

		respondToApproval(input) {
			const parsed: RespondToApprovalInput =
				respondToApprovalInputSchema.parse(input);
			options.dedupe.run(
				`respondToApproval:${parsed.commandId}`,
				parsed,
				() => {
					options.live
						.require(parsed.sessionId)
						.respondToApproval(parsed.approvalId, parsed.decision);
				},
			);
		},

		setMode(input) {
			const parsed: SetModeInput = setModeInputSchema.parse(input);
			rejectManagedSession(parsed.sessionId);
			options.dedupe.run(`setMode:${parsed.commandId}`, parsed, () => {
				options.live.require(parsed.sessionId).setMode(parsed.modeId);
			});
		},

		getSession(input) {
			const parsed: GetSessionInput = getSessionInputSchema.parse(input);
			const session = options.sessions.get(parsed.sessionId);
			return {
				session,
				cursor: session
					? {
							epoch: session.epoch,
							seq: options.journal.cursor(parsed.sessionId).seq,
						}
					: null,
			};
		},

		listSessions,

		getItems(input) {
			const parsed: GetItemsInput = getItemsInputSchema.parse(input);
			return readPage(options.db, parsed.sessionId, {
				before: parsed.before,
				limit: parsed.limit,
			});
		},
	};
}
