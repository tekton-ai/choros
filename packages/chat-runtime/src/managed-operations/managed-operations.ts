import { createHash, randomUUID } from "node:crypto";
import type { UserContent } from "@choros/chat/protocol";
import { and, eq } from "drizzle-orm";
import type { ChatDb, ManagedInputRow, ManagedOperationRow } from "../db";
import { chatManagedInputs, chatManagedOperations } from "../db";
import type {
	AdapterEvent,
	HarnessObserver,
	HarnessToolDefinition,
} from "../harness";
import type { ChatJournal } from "../journal";
import type { ChatSessionStore } from "../projection";
import type { LiveSessionRegistry } from "../sessions";

export type ManagedOperationState =
	| "accepted"
	| "running"
	| "ended"
	| "unknown";
export type ManagedOperationOutcome = "completed" | "failed" | "interrupted";

export type ManagedOperationStart = {
	operationId: string;
	parameterIdentity: unknown;
	sessionId?: string;
	scopeId: string;
	harness: string;
	accountRef?: string;
	targetKey?: string;
	cwd: string;
	modeId?: string;
	modelId?: string;
	resume?: { harnessSessionId: string };
	env?: Record<string, string>;
	instructions?: string;
	tools: HarnessToolDefinition[];
	prompt: UserContent[];
	observer?: HarnessObserver;
};

export type ManagedOperationSnapshot = {
	operationId: string;
	parametersHash: string;
	sessionId: string;
	scopeId: string;
	harness: string;
	accountRef?: string;
	targetKey?: string;
	providerSessionId?: string;
	providerTurnId?: string;
	state: ManagedOperationState;
	outcome?: ManagedOperationOutcome;
	quiescent: boolean;
	promptState: "pending" | "dispatching" | "sent";
	report?: unknown;
	error?: string;
};

export type ManagedOperationStartResult = ManagedOperationSnapshot & {
	recovered: boolean;
	live: boolean;
};

export type ManagedInput = {
	inputId: string;
	operationId: string;
	providerRequestId: string;
	kind: "permission" | "question";
	question: string;
	options?: Array<{ id: string; label: string }>;
	status: "pending" | "answered" | "delivered" | "unconfirmed";
	answer?: string;
};

export type ManagedOperationsOptions = {
	db: ChatDb;
	journal: ChatJournal;
	sessions: ChatSessionStore;
	live: LiveSessionRegistry;
	now?: () => number;
	mintSessionId?: () => string;
};

function canonical(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	const record = value as Record<string, unknown>;
	return `{${Object.keys(record)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
		.join(",")}}`;
}

function parametersHash(value: unknown): string {
	return createHash("sha256").update(canonical(value)).digest("hex");
}

function snapshot(row: ManagedOperationRow): ManagedOperationSnapshot {
	return {
		operationId: row.operationId,
		parametersHash: row.parametersHash,
		sessionId: row.sessionId,
		scopeId: row.scopeId,
		harness: row.harness,
		...(row.accountRef ? { accountRef: row.accountRef } : {}),
		...(row.targetKey ? { targetKey: row.targetKey } : {}),
		...(row.providerSessionId
			? { providerSessionId: row.providerSessionId }
			: {}),
		...(row.providerTurnId ? { providerTurnId: row.providerTurnId } : {}),
		state: row.state as ManagedOperationState,
		...(row.outcome ? { outcome: row.outcome as ManagedOperationOutcome } : {}),
		quiescent: row.quiescent,
		promptState: row.promptState as ManagedOperationSnapshot["promptState"],
		...(row.reportJson ? { report: JSON.parse(row.reportJson) } : {}),
		...(row.error ? { error: row.error } : {}),
	};
}

function inputSnapshot(row: ManagedInputRow): ManagedInput {
	return {
		inputId: row.inputId,
		operationId: row.operationId,
		providerRequestId: row.providerRequestId,
		kind: row.kind as ManagedInput["kind"],
		question: row.question,
		...(row.optionsJson
			? { options: JSON.parse(row.optionsJson) as ManagedInput["options"] }
			: {}),
		status: row.status as ManagedInput["status"],
		...(row.answer ? { answer: row.answer } : {}),
	};
}

export class ManagedChatOperations {
	constructor(private readonly options: ManagedOperationsOptions) {}

	start(input: ManagedOperationStart): ManagedOperationStartResult {
		const hash = parametersHash(input.parameterIdentity);
		const now = this.now();
		const sessionId = input.sessionId ?? this.mintSessionId();
		const inserted = this.options.db
			.insert(chatManagedOperations)
			.values({
				operationId: input.operationId,
				parametersHash: hash,
				sessionId,
				scopeId: input.scopeId,
				harness: input.harness,
				accountRef: input.accountRef,
				targetKey: input.targetKey,
				state: "accepted",
				promptState: "pending",
				quiescent: false,
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoNothing()
			.run();
		const recovered = inserted.changes === 0;
		const existing = this.require(input.operationId);
		if (existing.parametersHash !== hash) {
			throw new Error(
				`managed operation ${input.operationId} was already accepted with different parameters`,
			);
		}
		if (recovered) {
			const live = this.options.live.get(existing.sessionId) !== null;
			if (!live && !existing.quiescent) {
				this.markUnknown(
					input.operationId,
					"accepted provider operation is not attached after runtime recovery",
				);
			}
			return { ...this.inspect(input.operationId), recovered: true, live };
		}

		try {
			this.options.journal.open({
				sessionId,
				scopeId: input.scopeId,
				harness: input.harness,
			});
			this.options.live.create({
				sessionId,
				scopeId: input.scopeId,
				harness: input.harness,
				cwd: input.cwd,
				modeId: input.modeId,
				modelId: input.modelId,
				resume: input.resume,
				env: input.env,
				instructions: input.instructions,
				tools: input.tools,
				observer: {
					onEvent: async (event) => {
						this.observe(input.operationId, event);
						await input.observer?.onEvent?.(event);
					},
				},
			});
			this.update(input.operationId, { promptState: "dispatching" });
			this.options.live
				.require(sessionId)
				.prompt(input.prompt, `managed:${input.operationId}`);
			this.update(input.operationId, { promptState: "sent", state: "running" });
		} catch (error) {
			this.markUnknown(
				input.operationId,
				error instanceof Error ? error.message : String(error),
			);
			throw error;
		}
		return {
			...this.inspect(input.operationId),
			recovered: false,
			live: true,
		};
	}

	inspect(operationId: string): ManagedOperationSnapshot {
		return snapshot(this.require(operationId));
	}

	find(operationId: string): ManagedOperationSnapshot | null {
		const row = this.options.db
			.select()
			.from(chatManagedOperations)
			.where(eq(chatManagedOperations.operationId, operationId))
			.get();
		return row ? snapshot(row) : null;
	}

	findBySession(sessionId: string): ManagedOperationSnapshot | null {
		const row = this.options.db
			.select()
			.from(chatManagedOperations)
			.where(eq(chatManagedOperations.sessionId, sessionId))
			.get();
		return row ? snapshot(row) : null;
	}

	isProviderSessionOccupied(
		providerSessionId: string,
		exceptOperationId?: string,
	): boolean {
		return this.options.db
			.select()
			.from(chatManagedOperations)
			.where(eq(chatManagedOperations.providerSessionId, providerSessionId))
			.all()
			.some(
				(candidate) =>
					candidate.operationId !== exceptOperationId &&
					(!candidate.quiescent || candidate.state !== "ended"),
			);
	}

	isLive(sessionId: string): boolean {
		return this.options.live.get(sessionId) !== null;
	}

	async stop(
		operationId: string,
		outcome: ManagedOperationOutcome = "interrupted",
	): Promise<ManagedOperationSnapshot> {
		const current = this.inspect(operationId);
		const live = this.options.live.get(current.sessionId);
		const trustedTerminal =
			current.state === "ended" && current.outcome !== undefined;
		if (!live && !current.quiescent && !trustedTerminal) {
			this.markUnknown(
				operationId,
				"provider session is not attached, so process quiescence cannot be confirmed",
			);
			return this.inspect(operationId);
		}
		if (live) {
			const stopped = await this.options.live.dispose(current.sessionId);
			if (!stopped.quiescent && !trustedTerminal) {
				this.markUnknown(
					operationId,
					"provider transport closed without confirmed execution quiescence",
				);
				return this.inspect(operationId);
			}
		}
		this.update(operationId, {
			state: "ended",
			outcome: current.outcome ?? outcome,
			quiescent: true,
		});
		return this.inspect(operationId);
	}

	async cancelTurn(operationId: string): Promise<void> {
		const current = this.inspect(operationId);
		const session = this.options.live.get(current.sessionId);
		if (!session) {
			this.markUnknown(operationId, "provider session is not attached");
			throw new Error(`managed operation ${operationId} is not attached`);
		}
		await session.cancelTurn(current.providerTurnId);
	}

	respondToApproval(
		operationId: string,
		providerRequestId: string,
		decision: Parameters<
			ReturnType<LiveSessionRegistry["require"]>["respondToApproval"]
		>[1],
	): void {
		const current = this.inspect(operationId);
		this.options.live
			.require(current.sessionId)
			.respondToApproval(providerRequestId, decision);
	}

	recordReport(operationId: string, report: unknown): ManagedOperationSnapshot {
		this.update(operationId, { reportJson: JSON.stringify(report) });
		return this.inspect(operationId);
	}

	recordInput(input: Omit<ManagedInput, "status">): ManagedInput {
		const now = this.now();
		this.options.db
			.insert(chatManagedInputs)
			.values({
				inputId: input.inputId,
				operationId: input.operationId,
				providerRequestId: input.providerRequestId,
				kind: input.kind,
				question: input.question,
				optionsJson: input.options ? JSON.stringify(input.options) : null,
				status: "pending",
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoNothing()
			.run();
		return this.requireInput(input.inputId);
	}

	answerInput(inputId: string, answer: string): ManagedInput {
		this.options.db
			.update(chatManagedInputs)
			.set({ status: "answered", answer, updatedAt: this.now() })
			.where(
				and(
					eq(chatManagedInputs.inputId, inputId),
					eq(chatManagedInputs.status, "pending"),
				),
			)
			.run();
		return this.requireInput(inputId);
	}

	getInput(inputId: string): ManagedInput | null {
		const row = this.options.db
			.select()
			.from(chatManagedInputs)
			.where(eq(chatManagedInputs.inputId, inputId))
			.get();
		return row ? inputSnapshot(row) : null;
	}

	markInputDelivery(inputId: string, delivered: boolean): ManagedInput {
		this.options.db
			.update(chatManagedInputs)
			.set({
				status: delivered ? "delivered" : "unconfirmed",
				updatedAt: this.now(),
			})
			.where(eq(chatManagedInputs.inputId, inputId))
			.run();
		return this.requireInput(inputId);
	}

	markUnknown(operationId: string, error: string): void {
		this.update(operationId, { state: "unknown", quiescent: false, error });
	}

	private observe(operationId: string, event: AdapterEvent): void {
		if (event.kind === "session") {
			if (event.session.harnessSessionId) {
				const row = this.require(operationId);
				this.options.sessions.setHarnessSessionId(
					row.sessionId,
					event.session.harnessSessionId,
				);
				this.update(operationId, {
					providerSessionId: event.session.harnessSessionId,
				});
			}
			if (event.session.status === "dead") {
				this.markUnknown(
					operationId,
					"provider session ended without a quiescent receipt",
				);
			}
			return;
		}
		if (event.kind !== "turn") return;
		if (event.turn.status === "running") {
			this.update(operationId, {
				state: "running",
				providerTurnId: event.turn.id,
			});
			return;
		}
		this.update(operationId, {
			state: "ended",
			providerTurnId: event.turn.id,
			outcome: event.turn.status,
			quiescent: false,
			...(event.turn.error ? { error: event.turn.error.message } : {}),
		});
	}

	private require(operationId: string): ManagedOperationRow {
		const row = this.options.db
			.select()
			.from(chatManagedOperations)
			.where(eq(chatManagedOperations.operationId, operationId))
			.get();
		if (!row) throw new Error(`managed operation ${operationId} not found`);
		return row;
	}

	private requireInput(inputId: string): ManagedInput {
		const input = this.getInput(inputId);
		if (!input) throw new Error(`managed input ${inputId} not found`);
		return input;
	}

	private update(
		operationId: string,
		values: Partial<typeof chatManagedOperations.$inferInsert>,
	): void {
		this.options.db
			.update(chatManagedOperations)
			.set({ ...values, updatedAt: this.now() })
			.where(eq(chatManagedOperations.operationId, operationId))
			.run();
	}

	private now(): number {
		return (this.options.now ?? Date.now)();
	}

	private mintSessionId(): string {
		return (this.options.mintSessionId ?? randomUUID)();
	}
}
