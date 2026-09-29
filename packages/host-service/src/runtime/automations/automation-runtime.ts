import {
	createHash,
	createHmac,
	randomBytes,
	randomUUID,
	timingSafeEqual,
} from "node:crypto";
import {
	type Automation,
	type AutomationClient,
	type AutomationDefinition,
	type AutomationOccurrence,
	type AutomationPage,
	type AutomationPreview,
	type AutomationRun,
	type AutomationRunStatus,
	automationDefinitionSchema,
	automationListInputSchema,
	automationRunsInputSchema,
	type ExecutionInput,
	type ExecutionStageEvidence,
	executionReportSchema,
	type WorkEvent,
	workEventsInputSchema,
} from "@choros/shared/automation-contracts";
import {
	describeAutomationSchedule,
	nextAutomationOccurrence,
	previewAutomationOccurrences,
	validateAutomationSchedule,
} from "@choros/shared/automation-schedule";
import {
	and,
	asc,
	desc,
	eq,
	getTableColumns,
	gt,
	isNotNull,
	lt,
	lte,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import {
	automationRuns,
	automations,
	automationVersions,
	executionInputs,
	executionOperations,
	executionRuns,
	workCommandReceipts,
	workEvents,
} from "../../db/schema";
import type {
	AutomationRuntimeOptions,
	ExecutionDriverEvent,
	ExecutionDriverHandle,
} from "../executions/types";
import { ExecutionPreparationError } from "../executions/types";

const PREVIEW_TTL_MS = 10 * 60 * 1_000;
const TERMINAL_STATUSES: AutomationRunStatus[] = [
	"succeeded",
	"failed",
	"skipped",
	"cancelled",
	"needs_result",
];
const SCHEDULER_BATCH = 500;

export class AutomationRuntimeError extends Error {
	constructor(
		public readonly code:
			| "NOT_FOUND"
			| "VERSION_CONFLICT"
			| "REQUEST_CONFLICT"
			| "CONFIRMATION_INVALID"
			| "CONFIRMATION_EXPIRED"
			| "CONFIRMATION_CONSUMED"
			| "RUN_BUSY"
			| "INVALID_STATE"
			| "UNSUPPORTED_SCHEDULE",
		message: string,
	) {
		super(message);
		this.name = "AutomationRuntimeError";
	}
}

interface PreviewPayload {
	nonce: string;
	intent: "save" | "enable" | "run";
	automationId?: string;
	expectedVersion?: number;
	definition: AutomationDefinition;
	resolvedAt: number;
	expiresAt: number;
}

interface ReceiptRow {
	parameterDigest: string;
	result: string;
	confirmationDigest: string | null;
}

export interface AutomationRuntime extends AutomationClient {
	start(): Promise<void>;
	stop(): Promise<void>;
	tick(): Promise<void>;
}

type Db = AutomationRuntimeOptions["db"];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function stableValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stableValue);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.filter(([, item]) => item !== undefined)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, item]) => [key, stableValue(item)]),
		);
	}
	return value;
}

function stableJson(value: unknown): string {
	return JSON.stringify(stableValue(value));
}

function digest(value: unknown): string {
	return createHash("sha256").update(stableJson(value)).digest("hex");
}

function encodeCursor(createdAt: number, id: string): string {
	return Buffer.from(`${createdAt}:${id}`, "utf8").toString("base64url");
}

function decodeCursor(
	cursor?: string,
): { createdAt: number; id: string } | undefined {
	if (!cursor) return undefined;
	try {
		const decoded = Buffer.from(cursor, "base64url").toString("utf8");
		const separator = decoded.indexOf(":");
		const createdAt = Number(decoded.slice(0, separator));
		const id = decoded.slice(separator + 1);
		if (!Number.isSafeInteger(createdAt) || !id)
			throw new Error("invalid cursor");
		return { createdAt, id };
	} catch {
		throw new AutomationRuntimeError(
			"INVALID_STATE",
			"Invalid pagination cursor",
		);
	}
}

function boundedEvidence(
	stage: string,
	evidence: ExecutionStageEvidence,
): ExecutionStageEvidence {
	const bytes = Buffer.from(evidence.output, "utf8");
	const truncated = evidence.truncated || bytes.byteLength > 65_536;
	return {
		stage,
		exitCode: evidence.exitCode,
		output: truncated
			? bytes.subarray(0, 65_536).toString("utf8")
			: evidence.output,
		truncated,
		quiescent: evidence.quiescent,
	};
}

function instant(value: number | null | undefined): string | null {
	return value == null ? null : new Date(value).toISOString();
}

function parseDefinition(json: string): AutomationDefinition {
	return automationDefinitionSchema.parse(JSON.parse(json));
}

function occurrenceCursor(occurrence: AutomationOccurrence): number | null {
	if (occurrence.at) return Date.parse(occurrence.at);
	const match = /:cursor=(\d+)$/.exec(occurrence.key);
	return match ? Number(match[1]) : null;
}

function assertSupportedSchedule(definition: AutomationDefinition): void {
	try {
		validateAutomationSchedule(definition);
	} catch (error) {
		throw new AutomationRuntimeError(
			"UNSUPPORTED_SCHEDULE",
			error instanceof Error
				? error.message
				: "Unsupported automation schedule",
		);
	}
}

export function createAutomationRuntime(
	options: AutomationRuntimeOptions,
): AutomationRuntime {
	const now = options.now ?? Date.now;
	const previewSecret = randomBytes(32);
	const handles = new Map<string, ExecutionDriverHandle>();
	const abortControllers = new Map<string, AbortController>();
	const pumping = new Set<string>();
	let started = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let ticking: Promise<void> | undefined;

	function emit(
		db: Tx | Db,
		type: string,
		automationId?: string,
		runId?: string,
	): WorkEvent {
		const createdAt = now();
		const row = db
			.insert(workEvents)
			.values({ type, automationId, runId, createdAt })
			.returning({ seq: workEvents.seq })
			.get();
		const event = {
			seq: row.seq,
			type,
			automationId: automationId ?? undefined,
			runId: runId ?? undefined,
			createdAt: new Date(createdAt).toISOString(),
		};
		queueMicrotask(() => {
			try {
				options.notify?.(event);
			} catch {
				// Persistent work_events remain authoritative when a transient notification fails.
			}
		});
		return event;
	}

	function signPreview(payload: PreviewPayload): string {
		const body = Buffer.from(stableJson(payload), "utf8").toString("base64url");
		const signature = createHmac("sha256", previewSecret)
			.update(body)
			.digest("base64url");
		return `${body}.${signature}`;
	}

	function verifyPreview(
		token: string,
		intent: PreviewPayload["intent"],
	): PreviewPayload {
		const [body, suppliedSignature, extra] = token.split(".");
		if (!body || !suppliedSignature || extra) {
			throw new AutomationRuntimeError(
				"CONFIRMATION_INVALID",
				"Invalid confirmation token",
			);
		}
		const expected = createHmac("sha256", previewSecret).update(body).digest();
		let supplied: Buffer;
		try {
			supplied = Buffer.from(suppliedSignature, "base64url");
		} catch {
			throw new AutomationRuntimeError(
				"CONFIRMATION_INVALID",
				"Invalid confirmation token",
			);
		}
		if (
			supplied.length !== expected.length ||
			!timingSafeEqual(supplied, expected)
		) {
			throw new AutomationRuntimeError(
				"CONFIRMATION_INVALID",
				"Invalid confirmation token",
			);
		}
		let payload: PreviewPayload;
		try {
			payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
			payload.definition = automationDefinitionSchema.parse(payload.definition);
		} catch {
			throw new AutomationRuntimeError(
				"CONFIRMATION_INVALID",
				"Invalid confirmation token",
			);
		}
		if (payload.intent !== intent) {
			throw new AutomationRuntimeError(
				"CONFIRMATION_INVALID",
				`Confirmation is for ${payload.intent}, not ${intent}`,
			);
		}
		if (payload.expiresAt < now()) {
			throw new AutomationRuntimeError(
				"CONFIRMATION_EXPIRED",
				"Confirmation expired; preview the unchanged definition again",
			);
		}
		return payload;
	}

	function receipt<T>(
		scope: string,
		requestId: string,
		parameters: unknown,
	): T | undefined {
		const row = options.db
			.select({
				parameterDigest: workCommandReceipts.parameterDigest,
				result: workCommandReceipts.result,
				confirmationDigest: workCommandReceipts.confirmationDigest,
			})
			.from(workCommandReceipts)
			.where(
				and(
					eq(workCommandReceipts.scope, scope),
					eq(workCommandReceipts.requestId, requestId),
				),
			)
			.get() as ReceiptRow | undefined;
		if (!row) return undefined;
		if (row.parameterDigest !== digest(parameters)) {
			throw new AutomationRuntimeError(
				"REQUEST_CONFLICT",
				`Request ${requestId} was already used with different parameters`,
			);
		}
		return JSON.parse(row.result) as T;
	}

	function saveReceipt(
		tx: Tx,
		scope: string,
		requestId: string,
		parameters: unknown,
		result: unknown,
		confirmationToken?: string,
	): void {
		try {
			tx.insert(workCommandReceipts)
				.values({
					scope,
					requestId,
					parameterDigest: digest(parameters),
					confirmationDigest: confirmationToken
						? digest(confirmationToken)
						: null,
					result: JSON.stringify(result),
					createdAt: now(),
				})
				.run();
		} catch (error) {
			if (confirmationToken) {
				throw new AutomationRuntimeError(
					"CONFIRMATION_CONSUMED",
					"Confirmation was already consumed by another request",
				);
			}
			throw error;
		}
	}

	function definitionFor(
		db: Db | Tx,
		automationId: string,
		revision: number,
	): AutomationDefinition {
		const row = db
			.select({ definition: automationVersions.definition })
			.from(automationVersions)
			.where(
				and(
					eq(automationVersions.automationId, automationId),
					eq(automationVersions.revision, revision),
				),
			)
			.get();
		if (!row)
			throw new AutomationRuntimeError(
				"NOT_FOUND",
				"Automation definition version not found",
			);
		return parseDefinition(row.definition);
	}

	function getExecutionInputRows(executionId: string): ExecutionInput[] {
		return options.db
			.select()
			.from(executionInputs)
			.where(eq(executionInputs.executionId, executionId))
			.orderBy(asc(executionInputs.createdAt), asc(executionInputs.id))
			.all()
			.map((row) => ({
				id: row.id,
				executionId: row.executionId,
				kind: row.kind as ExecutionInput["kind"],
				question: row.question,
				options: row.options ? JSON.parse(row.options) : undefined,
				status: row.status as ExecutionInput["status"],
				version: row.version,
				answer: row.answer ?? undefined,
			}));
	}

	function projectRun(row: typeof automationRuns.$inferSelect): AutomationRun {
		const definition = definitionFor(
			options.db,
			row.automationId,
			row.definitionRevision,
		);
		const execution = row.executionId
			? options.db
					.select()
					.from(executionRuns)
					.where(eq(executionRuns.id, row.executionId))
					.get()
			: undefined;
		return {
			id: row.id,
			automationId: row.automationId,
			definitionRevision: row.definitionRevision,
			definition,
			source: row.source as AutomationRun["source"],
			status: (execution?.status ?? row.status) as AutomationRunStatus,
			plannedAt: instant(row.plannedAt),
			createdAt: new Date(row.createdAt).toISOString(),
			startedAt: instant(execution?.startedAt ?? row.startedAt),
			finishedAt: instant(execution?.finishedAt ?? row.finishedAt),
			stage: execution?.stage,
			reason: row.reason ?? undefined,
			executionId: execution?.id,
			workspaceId: execution?.workspaceId ?? undefined,
			chatSessionId: execution?.chatSessionId ?? undefined,
			providerSessionId: execution?.providerSessionId ?? undefined,
			retryOf: row.retryOf ?? undefined,
			report: execution?.report
				? executionReportSchema.parse(JSON.parse(execution.report))
				: undefined,
			preparation: execution?.preparationEvidence
				? (JSON.parse(
						execution.preparationEvidence,
					) as ExecutionStageEvidence[])
				: undefined,
			inputs: execution ? getExecutionInputRows(execution.id) : [],
		};
	}

	function projectAutomation(row: typeof automations.$inferSelect): Automation {
		const last = options.db
			.select()
			.from(automationRuns)
			.where(eq(automationRuns.automationId, row.id))
			.orderBy(desc(automationRuns.createdAt), desc(automationRuns.id))
			.limit(1)
			.get();
		return {
			id: row.id,
			revision: row.currentRevision,
			version: row.version,
			definition: definitionFor(options.db, row.id, row.currentRevision),
			state: row.state as Automation["state"],
			nextRunAt: instant(row.nextDueAt),
			usedRounds: row.usedRounds,
			createdAt: new Date(row.createdAt).toISOString(),
			updatedAt: new Date(row.updatedAt).toISOString(),
			resumeAt: instant(row.resumeAt),
			lastRun: last ? projectRun(last) : undefined,
		};
	}

	function requireAutomation(db: Db | Tx, id: string) {
		const row = db
			.select()
			.from(automations)
			.where(eq(automations.id, id))
			.get();
		if (!row)
			throw new AutomationRuntimeError(
				"NOT_FOUND",
				`Automation ${id} not found`,
			);
		return row;
	}

	function assertVersion(
		row: typeof automations.$inferSelect,
		expectedVersion: number,
	): void {
		if (row.version !== expectedVersion) {
			throw new AutomationRuntimeError(
				"VERSION_CONFLICT",
				`Expected version ${expectedVersion}, found ${row.version}`,
			);
		}
	}

	function getRunRow(db: Db | Tx, id: string) {
		const row = db
			.select()
			.from(automationRuns)
			.where(eq(automationRuns.id, id))
			.get();
		if (!row)
			throw new AutomationRuntimeError("NOT_FOUND", `Run ${id} not found`);
		return row;
	}

	function activeOccupancy(
		db: Db | Tx,
		automationId: string,
		workspaceId?: string,
	) {
		const automationBusy = db
			.select({ id: executionRuns.id })
			.from(executionRuns)
			.where(eq(executionRuns.automationOccupancy, automationId))
			.get();
		if (automationBusy) return "overlap" as const;
		if (workspaceId) {
			const workspaceBusy = db
				.select({ id: executionRuns.id })
				.from(executionRuns)
				.where(eq(executionRuns.workspaceOccupancy, workspaceId))
				.get();
			if (workspaceBusy) return "workspace_busy" as const;
		}
		return undefined;
	}

	function hasActiveScheduledExecution(
		db: Db | Tx,
		automationId: string,
	): boolean {
		return Boolean(
			db
				.select({ id: executionRuns.id })
				.from(executionRuns)
				.innerJoin(automationRuns, eq(automationRuns.id, executionRuns.runId))
				.where(
					and(
						eq(executionRuns.automationOccupancy, automationId),
						eq(automationRuns.source, "scheduled"),
					),
				)
				.get(),
		);
	}

	function acceptExecution(
		tx: Tx,
		input: {
			automationId: string;
			revision: number;
			definition: AutomationDefinition;
			source: AutomationRun["source"];
			plannedAt?: number | null;
			occurrenceKey?: string | null;
			retryOf?: string;
		},
	): { runId: string; executionId: string } {
		const workspaceId =
			input.definition.target.kind === "existingWorkspace"
				? input.definition.target.workspaceId
				: randomUUID();
		const busy = activeOccupancy(tx, input.automationId, workspaceId);
		if (busy)
			throw new AutomationRuntimeError(
				"RUN_BUSY",
				busy === "overlap"
					? "Automation already has an active execution"
					: "Workspace already has an active managed execution",
			);
		const createdAt = now();
		const runId = randomUUID();
		const executionId = randomUUID();
		const operationId = randomUUID();
		tx.insert(automationRuns)
			.values({
				id: runId,
				automationId: input.automationId,
				definitionRevision: input.revision,
				source: input.source,
				plannedAt: input.plannedAt ?? null,
				occurrenceKey: input.occurrenceKey ?? null,
				status: "preparing",
				executionId,
				retryOf: input.retryOf,
				createdAt,
			})
			.run();
		tx.insert(executionRuns)
			.values({
				id: executionId,
				runId,
				automationId: input.automationId,
				definitionRevision: input.revision,
				status: "preparing",
				stage: "accepted",
				workspaceId,
				automationOccupancy: input.automationId,
				workspaceOccupancy: workspaceId,
				createdAt,
			})
			.run();
		tx.insert(executionOperations)
			.values([
				{
					id: operationId,
					executionId,
					kind: "prepare",
					state: "pending",
					parameterDigest: digest({
						definition: input.definition,
						executionId,
					}),
					createdAt,
					updatedAt: createdAt,
				},
				{
					id: randomUUID(),
					executionId,
					kind: "dispatch",
					state: "pending",
					parameterDigest: digest({
						definition: input.definition,
						executionId,
					}),
					createdAt,
					updatedAt: createdAt,
				},
			])
			.run();
		emit(tx, "run.accepted", input.automationId, runId);
		return { runId, executionId };
	}

	function recordSkipped(
		tx: Tx,
		input: {
			automationId: string;
			revision: number;
			plannedAt: number | null;
			occurrenceKey: string;
			reason: string;
		},
	): string {
		const id = randomUUID();
		const timestamp = now();
		tx.insert(automationRuns)
			.values({
				id,
				automationId: input.automationId,
				definitionRevision: input.revision,
				source: "scheduled",
				plannedAt: input.plannedAt,
				occurrenceKey: input.occurrenceKey,
				status: "skipped",
				reason: input.reason,
				createdAt: timestamp,
				finishedAt: timestamp,
			})
			.run();
		emit(tx, "run.skipped", input.automationId, id);
		return id;
	}

	function scheduleAfter(
		definition: AutomationDefinition,
		after: number,
		lastFinishedAt?: number,
	): AutomationOccurrence | null {
		return nextAutomationOccurrence(definition, after, lastFinishedAt);
	}

	function initialSchedule(
		definition: AutomationDefinition,
		after: number,
	): AutomationOccurrence | null {
		if (definition.schedule.kind === "immediate") return null;
		const occurrence = scheduleAfter(definition, after);
		if (
			occurrence?.at &&
			definition.stop.endsBefore &&
			Date.parse(occurrence.at) >= Date.parse(definition.stop.endsBefore)
		)
			return null;
		return occurrence;
	}

	function scheduleAfterCompletion(
		definition: AutomationDefinition,
		finishedAt: number,
	): AutomationOccurrence | null {
		if (definition.schedule.kind !== "afterCompletion") return null;
		return scheduleAfter(
			definition,
			definition.schedule.intervalSeconds === 0 ? finishedAt - 1 : finishedAt,
			finishedAt,
		);
	}

	function activationSchedule(
		db: Db | Tx,
		row: typeof automations.$inferSelect,
		definition: AutomationDefinition,
		at: number,
	): {
		next: AutomationOccurrence | null;
		scheduleCursor: number;
		lastFinishedAt: number | null;
		waitsForActiveCompletion: boolean;
	} {
		const waitsForActiveCompletion =
			definition.schedule.kind === "afterCompletion" &&
			hasActiveScheduledExecution(db, row.id);
		const next = waitsForActiveCompletion
			? null
			: definition.schedule.kind === "afterCompletion"
				? scheduleAfterCompletion(definition, at)
				: initialSchedule(definition, at);
		return {
			next,
			scheduleCursor:
				definition.schedule.kind === "afterCompletion" &&
				definition.schedule.intervalSeconds === 0
					? at - 1
					: at,
			lastFinishedAt:
				definition.schedule.kind === "afterCompletion" &&
				!waitsForActiveCompletion
					? at
					: row.lastFinishedAt,
			waitsForActiveCompletion,
		};
	}

	async function preview(
		input: Parameters<AutomationClient["preview"]>[0],
	): Promise<AutomationPreview> {
		const parsed = automationDefinitionSchema.parse(input.definition);
		assertSupportedSchedule(parsed);
		let usedRounds = 0;
		if (input.automationId) {
			const existing = requireAutomation(options.db, input.automationId);
			if (input.expectedVersion == null) {
				throw new AutomationRuntimeError(
					"VERSION_CONFLICT",
					"Existing automation preview requires expectedVersion",
				);
			}
			assertVersion(existing, input.expectedVersion);
			usedRounds = existing.usedRounds;
		}
		const resolved = automationDefinitionSchema.parse(
			await options.resolveDefinition(parsed),
		);
		assertSupportedSchedule(resolved);
		const resolvedAt = now();
		const payload: PreviewPayload = {
			nonce: randomUUID(),
			intent: input.intent ?? "save",
			automationId: input.automationId,
			expectedVersion: input.expectedVersion,
			definition: resolved,
			resolvedAt,
			expiresAt: resolvedAt + PREVIEW_TTL_MS,
		};
		return {
			definition: resolved,
			summary: `${resolved.name} — ${describeAutomationSchedule(resolved)}`,
			nextOccurrences: previewAutomationOccurrences(
				resolved,
				resolvedAt,
				resolved.stop.maxRounds == null
					? 5
					: Math.max(0, resolved.stop.maxRounds - usedRounds),
			),
			confirmationToken: signPreview(payload),
			expiresAt: new Date(payload.expiresAt).toISOString(),
			resolvedAt: new Date(resolvedAt).toISOString(),
		};
	}

	async function create(
		input: Parameters<AutomationClient["create"]>[0],
	): Promise<{ automation: Automation; run?: AutomationRun }> {
		const parameters = {
			confirmationToken: input.confirmationToken,
			runImmediately: input.runImmediately,
		};
		const prior = receipt<{ automationId: string; runId?: string }>(
			"automations.create",
			input.requestId,
			parameters,
		);
		if (prior)
			return {
				automation: get({ id: prior.automationId }),
				run: prior.runId ? getRun({ id: prior.runId }) : undefined,
			};
		const payload = verifyPreview(
			input.confirmationToken,
			input.runImmediately ? "run" : "save",
		);
		if (payload.automationId != null || payload.expectedVersion != null) {
			throw new AutomationRuntimeError(
				"CONFIRMATION_INVALID",
				"Create confirmation is bound to an existing automation",
			);
		}
		const automationId = randomUUID();
		let accepted: { runId: string; executionId: string } | undefined;
		options.db.transaction((tx) => {
			const timestamp = now();
			const first = initialSchedule(payload.definition, payload.resolvedAt);
			tx.insert(automations)
				.values({
					id: automationId,
					currentRevision: 1,
					version: 1,
					state: "paused",
					nextDueAt: first ? occurrenceCursor(first) : null,
					scheduleCursor: payload.resolvedAt,
					usedRounds: 0,
					createdAt: timestamp,
					updatedAt: timestamp,
				})
				.run();
			tx.insert(automationVersions)
				.values({
					automationId,
					revision: 1,
					definition: stableJson(payload.definition),
					createdAt: timestamp,
				})
				.run();
			if (input.runImmediately) {
				accepted = acceptExecution(tx, {
					automationId,
					revision: 1,
					definition: payload.definition,
					source: "manual",
				});
			}
			saveReceipt(
				tx,
				"automations.create",
				input.requestId,
				parameters,
				{ automationId, runId: accepted?.runId },
				input.confirmationToken,
			);
			emit(tx, "automation.created", automationId);
		});
		if (accepted) launchPump(accepted.executionId);
		return {
			automation: get({ id: automationId }),
			run: accepted ? getRun({ id: accepted.runId }) : undefined,
		};
	}

	async function update(
		input: Parameters<AutomationClient["update"]>[0],
	): Promise<Automation> {
		const parameters = {
			id: input.id,
			expectedVersion: input.expectedVersion,
			confirmationToken: input.confirmationToken,
		};
		const prior = receipt<{ automationId: string }>(
			"automations.update",
			input.requestId,
			parameters,
		);
		if (prior) return get({ id: prior.automationId });
		const payload = verifyPreview(input.confirmationToken, "save");
		if (
			payload.automationId !== input.id ||
			payload.expectedVersion !== input.expectedVersion
		) {
			throw new AutomationRuntimeError(
				"CONFIRMATION_INVALID",
				"Confirmation is bound to another automation version",
			);
		}
		options.db.transaction((tx) => {
			const row = requireAutomation(tx, input.id);
			assertVersion(row, input.expectedVersion);
			const current = definitionFor(tx, input.id, row.currentRevision);
			const materialChange =
				stableJson(current) !== stableJson(payload.definition);
			const schedulingChange =
				stableJson({ ...current, name: undefined }) !==
				stableJson({ ...payload.definition, name: undefined });
			if (
				payload.definition.stop.maxRounds != null &&
				payload.definition.stop.maxRounds < row.usedRounds
			) {
				throw new AutomationRuntimeError(
					"INVALID_STATE",
					"maxRounds cannot be lower than rounds already used; pause the schedule instead",
				);
			}
			const revision = materialChange
				? row.currentRevision + 1
				: row.currentRevision;
			const timestamp = now();
			if (materialChange) {
				tx.insert(automationVersions)
					.values({
						automationId: input.id,
						revision,
						definition: stableJson(payload.definition),
						createdAt: timestamp,
					})
					.run();
			}
			const next = initialSchedule(payload.definition, payload.resolvedAt);
			tx.update(automations)
				.set({
					currentRevision: revision,
					version: row.version + 1,
					state: schedulingChange ? "paused" : row.state,
					nextDueAt: schedulingChange
						? next
							? occurrenceCursor(next)
							: null
						: row.nextDueAt,
					scheduleCursor: schedulingChange
						? payload.resolvedAt
						: row.scheduleCursor,
					resumeAt: schedulingChange ? null : row.resumeAt,
					updatedAt: timestamp,
				})
				.where(eq(automations.id, input.id))
				.run();
			saveReceipt(
				tx,
				"automations.update",
				input.requestId,
				parameters,
				{ automationId: input.id },
				input.confirmationToken,
			);
			emit(tx, "automation.updated", input.id);
		});
		return get({ id: input.id });
	}

	async function setScheduleState(
		input: Parameters<AutomationClient["setScheduleState"]>[0],
	): Promise<Automation> {
		const parameters = {
			id: input.id,
			expectedVersion: input.expectedVersion,
			state: input.state,
			confirmationToken: input.confirmationToken,
			resumeAt: input.resumeAt,
		};
		const prior = receipt<{ automationId: string }>(
			"automations.setScheduleState",
			input.requestId,
			parameters,
		);
		if (prior) return get({ id: prior.automationId });
		let confirmation: PreviewPayload | undefined;
		if (input.state === "enabled") {
			if (!input.confirmationToken)
				throw new AutomationRuntimeError(
					"CONFIRMATION_INVALID",
					"Enabling requires a current confirmation",
				);
			confirmation = verifyPreview(input.confirmationToken, "enable");
			if (
				confirmation.automationId !== input.id ||
				confirmation.expectedVersion !== input.expectedVersion
			) {
				throw new AutomationRuntimeError(
					"CONFIRMATION_INVALID",
					"Confirmation is bound to another automation version",
				);
			}
		}
		options.db.transaction((tx) => {
			const row = requireAutomation(tx, input.id);
			assertVersion(row, input.expectedVersion);
			if (row.state === "archived")
				throw new AutomationRuntimeError(
					"INVALID_STATE",
					"Archived automations cannot be enabled or paused",
				);
			const definition = definitionFor(tx, row.id, row.currentRevision);
			if (
				confirmation &&
				stableJson(confirmation.definition) !== stableJson(definition)
			) {
				throw new AutomationRuntimeError(
					"CONFIRMATION_INVALID",
					"Definition changed after confirmation",
				);
			}
			const timestamp = now();
			let nextDueAt = row.nextDueAt;
			let scheduleCursor = row.scheduleCursor;
			let lastFinishedAt = row.lastFinishedAt;
			let resumeAt: number | null = input.resumeAt
				? Date.parse(input.resumeAt)
				: null;
			if (input.state === "enabled") {
				if (definition.schedule.kind === "immediate")
					throw new AutomationRuntimeError(
						"INVALID_STATE",
						"Immediate schedules have no future occurrence; use runNow",
					);
				if (
					definition.schedule.kind === "once" &&
					Date.parse(definition.schedule.at) <= timestamp
				)
					throw new AutomationRuntimeError(
						"INVALID_STATE",
						"The one-time occurrence is in the past; change it or use runNow",
					);
				if (
					definition.stop.maxRounds != null &&
					row.usedRounds >= definition.stop.maxRounds
				)
					throw new AutomationRuntimeError(
						"INVALID_STATE",
						"The configured round limit is already exhausted",
					);
				const activation = activationSchedule(tx, row, definition, timestamp);
				const { next, waitsForActiveCompletion } = activation;
				nextDueAt = next ? occurrenceCursor(next) : null;
				scheduleCursor = activation.scheduleCursor;
				lastFinishedAt = activation.lastFinishedAt;
				resumeAt = null;
				if (!next && !waitsForActiveCompletion)
					throw new AutomationRuntimeError(
						"INVALID_STATE",
						"Schedule has no future occurrence",
					);
			}
			tx.update(automations)
				.set({
					state: input.state,
					version: row.version + 1,
					nextDueAt,
					scheduleCursor,
					lastFinishedAt,
					resumeAt,
					updatedAt: timestamp,
				})
				.where(eq(automations.id, input.id))
				.run();
			saveReceipt(
				tx,
				"automations.setScheduleState",
				input.requestId,
				parameters,
				{ automationId: input.id },
				input.state === "enabled" ? input.confirmationToken : undefined,
			);
			emit(
				tx,
				input.state === "enabled" ? "automation.enabled" : "automation.paused",
				input.id,
			);
		});
		return get({ id: input.id });
	}

	async function archive(
		input: Parameters<AutomationClient["archive"]>[0],
	): Promise<Automation> {
		const parameters = { id: input.id, expectedVersion: input.expectedVersion };
		const prior = receipt<{ automationId: string }>(
			"automations.archive",
			input.requestId,
			parameters,
		);
		if (prior) return get({ id: prior.automationId });
		options.db.transaction((tx) => {
			const row = requireAutomation(tx, input.id);
			assertVersion(row, input.expectedVersion);
			tx.update(automations)
				.set({
					state: "archived",
					nextDueAt: null,
					resumeAt: null,
					version: row.version + 1,
					updatedAt: now(),
				})
				.where(eq(automations.id, input.id))
				.run();
			saveReceipt(tx, "automations.archive", input.requestId, parameters, {
				automationId: input.id,
			});
			emit(tx, "automation.archived", input.id);
		});
		return get({ id: input.id });
	}

	async function runNow(
		input: Parameters<AutomationClient["runNow"]>[0],
	): Promise<AutomationRun> {
		const parameters = { id: input.id };
		const prior = receipt<{ runId: string }>(
			"automations.runNow",
			input.requestId,
			parameters,
		);
		if (prior) return getRun({ id: prior.runId });
		let accepted!: { runId: string; executionId: string };
		options.db.transaction((tx) => {
			const row = requireAutomation(tx, input.id);
			if (row.state === "archived")
				throw new AutomationRuntimeError(
					"INVALID_STATE",
					"Archived automations cannot run",
				);
			const definition = definitionFor(tx, row.id, row.currentRevision);
			accepted = acceptExecution(tx, {
				automationId: row.id,
				revision: row.currentRevision,
				definition,
				source: "manual",
			});
			saveReceipt(tx, "automations.runNow", input.requestId, parameters, {
				runId: accepted.runId,
			});
		});
		launchPump(accepted.executionId);
		return getRun({ id: accepted.runId });
	}

	async function retryRun(
		input: Parameters<AutomationClient["retryRun"]>[0],
	): Promise<AutomationRun> {
		const parameters = { runId: input.runId };
		const prior = receipt<{ runId: string }>(
			"automations.retryRun",
			input.requestId,
			parameters,
		);
		if (prior) return getRun({ id: prior.runId });
		let accepted!: { runId: string; executionId: string };
		options.db.transaction((tx) => {
			const original = getRunRow(tx, input.runId);
			const automation = requireAutomation(tx, original.automationId);
			if (automation.state === "archived")
				throw new AutomationRuntimeError(
					"INVALID_STATE",
					"Archived automations cannot run",
				);
			const definition = definitionFor(
				tx,
				original.automationId,
				original.definitionRevision,
			);
			accepted = acceptExecution(tx, {
				automationId: original.automationId,
				revision: original.definitionRevision,
				definition,
				source: "retry",
				retryOf: original.id,
			});
			saveReceipt(tx, "automations.retryRun", input.requestId, parameters, {
				runId: accepted.runId,
			});
		});
		launchPump(accepted.executionId);
		return getRun({ id: accepted.runId });
	}

	function get(input: { id: string }): Automation {
		return projectAutomation(requireAutomation(options.db, input.id));
	}

	function list(
		input?: Parameters<AutomationClient["list"]>[0],
	): AutomationPage<Automation> {
		const parsed = automationListInputSchema.parse(input);
		const cursor = decodeCursor(parsed.cursor);
		const filters: SQL[] = [];
		if (parsed.state) filters.push(eq(automations.state, parsed.state));
		if (cursor) {
			filters.push(
				or(
					lt(automations.updatedAt, cursor.createdAt),
					and(
						eq(automations.updatedAt, cursor.createdAt),
						lt(automations.id, cursor.id),
					),
				)!,
			);
		}
		const targetFilters: SQL[] = [];
		if (parsed.projectIds?.length) {
			targetFilters.push(
				sql`json_extract(${automationVersions.definition}, '$.target.projectId') in (${sql.join(
					parsed.projectIds.map((id) => sql`${id}`),
					sql`, `,
				)})`,
			);
		}
		if (parsed.workspaceIds?.length) {
			targetFilters.push(
				sql`json_extract(${automationVersions.definition}, '$.target.workspaceId') in (${sql.join(
					parsed.workspaceIds.map((id) => sql`${id}`),
					sql`, `,
				)})`,
			);
		}
		if (targetFilters.length) filters.push(or(...targetFilters)!);
		const selected = options.db
			.select(getTableColumns(automations))
			.from(automations)
			.innerJoin(
				automationVersions,
				and(
					eq(automationVersions.automationId, automations.id),
					eq(automationVersions.revision, automations.currentRevision),
				),
			)
			.where(and(...filters))
			.orderBy(desc(automations.updatedAt), desc(automations.id))
			.limit(parsed.limit + 1)
			.all();
		const pageRows = selected.slice(0, parsed.limit);
		const eventCursor =
			options.db
				.select({ seq: workEvents.seq })
				.from(workEvents)
				.orderBy(desc(workEvents.seq))
				.limit(1)
				.get()?.seq ?? 0;
		return {
			items: pageRows.map(projectAutomation),
			nextCursor:
				selected.length > parsed.limit && pageRows.length
					? encodeCursor(pageRows.at(-1)!.updatedAt, pageRows.at(-1)!.id)
					: null,
			cursor: eventCursor,
		};
	}

	function getRun(input: { id: string }): AutomationRun {
		return projectRun(getRunRow(options.db, input.id));
	}

	function listRuns(
		input?: Parameters<AutomationClient["listRuns"]>[0],
	): AutomationPage<AutomationRun> {
		const parsed = automationRunsInputSchema.parse(input);
		const cursor = decodeCursor(parsed.cursor);
		const condition =
			parsed.automationId && parsed.status
				? and(
						eq(automationRuns.automationId, parsed.automationId),
						eq(automationRuns.status, parsed.status),
					)
				: parsed.automationId
					? eq(automationRuns.automationId, parsed.automationId)
					: parsed.status
						? eq(automationRuns.status, parsed.status)
						: undefined;
		const cursorCondition = cursor
			? or(
					lt(automationRuns.createdAt, cursor.createdAt),
					and(
						eq(automationRuns.createdAt, cursor.createdAt),
						lt(automationRuns.id, cursor.id),
					),
				)
			: undefined;
		const selected = options.db
			.select()
			.from(automationRuns)
			.where(and(condition, cursorCondition))
			.orderBy(desc(automationRuns.createdAt), desc(automationRuns.id))
			.limit(parsed.limit + 1)
			.all();
		const pageRows = selected.slice(0, parsed.limit);
		const eventCursor =
			options.db
				.select({ seq: workEvents.seq })
				.from(workEvents)
				.orderBy(desc(workEvents.seq))
				.limit(1)
				.get()?.seq ?? 0;
		return {
			items: pageRows.map(projectRun),
			nextCursor:
				selected.length > parsed.limit && pageRows.length
					? encodeCursor(pageRows.at(-1)!.createdAt, pageRows.at(-1)!.id)
					: null,
			cursor: eventCursor,
		};
	}

	function readEvents(input?: Parameters<AutomationClient["readEvents"]>[0]): {
		events: WorkEvent[];
		cursor: number;
	} {
		const parsed = workEventsInputSchema.parse(input);
		const rows = options.db
			.select()
			.from(workEvents)
			.where(gt(workEvents.seq, parsed.after))
			.orderBy(asc(workEvents.seq))
			.limit(parsed.limit)
			.all();
		return {
			events: rows.map((row) => ({
				seq: row.seq,
				type: row.type,
				automationId: row.automationId ?? undefined,
				runId: row.runId ?? undefined,
				createdAt: new Date(row.createdAt).toISOString(),
			})),
			cursor: rows.at(-1)?.seq ?? parsed.after,
		};
	}

	async function requestCancel(
		input: Parameters<AutomationClient["requestCancel"]>[0],
	): Promise<AutomationRun> {
		const parameters = { runId: input.runId };
		const prior = receipt<{ runId: string }>(
			"executions.requestCancel",
			input.requestId,
			parameters,
		);
		if (prior) return getRun({ id: prior.runId });
		let executionId: string | undefined;
		options.db.transaction((tx) => {
			const run = getRunRow(tx, input.runId);
			if (
				!run.executionId ||
				TERMINAL_STATUSES.includes(run.status as AutomationRunStatus)
			) {
				saveReceipt(
					tx,
					"executions.requestCancel",
					input.requestId,
					parameters,
					{ runId: run.id },
				);
				return;
			}
			const execution = tx
				.select()
				.from(executionRuns)
				.where(eq(executionRuns.id, run.executionId))
				.get();
			if (!execution)
				throw new AutomationRuntimeError("NOT_FOUND", "Execution not found");
			executionId = execution.id;
			tx.update(executionRuns)
				.set({
					cancelRequestedAt: execution.cancelRequestedAt ?? now(),
					status: "stopping",
					stage: "cancelling",
				})
				.where(eq(executionRuns.id, execution.id))
				.run();
			tx.update(automationRuns)
				.set({ status: "stopping" })
				.where(eq(automationRuns.id, run.id))
				.run();
			saveReceipt(tx, "executions.requestCancel", input.requestId, parameters, {
				runId: run.id,
			});
			emit(tx, "execution.cancel_requested", run.automationId, run.id);
		});
		if (executionId) await cancelExecution(executionId);
		return getRun({ id: input.runId });
	}

	async function answerInput(
		input: Parameters<AutomationClient["answerInput"]>[0],
	): Promise<AutomationRun> {
		const parameters = {
			inputId: input.inputId,
			expectedVersion: input.expectedVersion,
			answer: input.answer,
		};
		const prior = receipt<{ runId: string }>(
			"executions.answerInput",
			input.requestId,
			parameters,
		);
		if (prior) return getRun({ id: prior.runId });
		let executionId = "";
		let runId = "";
		options.db.transaction((tx) => {
			const question = tx
				.select()
				.from(executionInputs)
				.where(eq(executionInputs.id, input.inputId))
				.get();
			if (!question)
				throw new AutomationRuntimeError(
					"NOT_FOUND",
					"Input request not found",
				);
			if (question.version !== input.expectedVersion)
				throw new AutomationRuntimeError(
					"VERSION_CONFLICT",
					`Expected input version ${input.expectedVersion}, found ${question.version}`,
				);
			const execution = tx
				.select()
				.from(executionRuns)
				.where(eq(executionRuns.id, question.executionId))
				.get();
			if (!execution)
				throw new AutomationRuntimeError("NOT_FOUND", "Execution not found");
			if (
				execution.cancelRequestedAt ||
				TERMINAL_STATUSES.includes(execution.status as AutomationRunStatus)
			) {
				throw new AutomationRuntimeError(
					"INVALID_STATE",
					"Execution no longer accepts input answers",
				);
			}
			executionId = execution.id;
			runId = execution.runId;
			const answerClaim = tx
				.update(executionInputs)
				.set({
					status: "answered",
					answer: input.answer,
					deliveryState: "pending",
					answeredAt: now(),
					version: question.version + 1,
				})
				.where(
					and(
						eq(executionInputs.id, question.id),
						eq(executionInputs.version, question.version),
						eq(executionInputs.status, "pending"),
					),
				)
				.run();
			if (answerClaim.changes !== 1)
				throw new AutomationRuntimeError(
					"VERSION_CONFLICT",
					"Input request changed while answering",
				);
			saveReceipt(tx, "executions.answerInput", input.requestId, parameters, {
				runId,
			});
			emit(tx, "execution.input_answered", execution.automationId, runId);
		});
		const handle = handles.get(executionId);
		if (!handle) {
			options.db.transaction((tx) => {
				const current = tx
					.select()
					.from(executionRuns)
					.where(eq(executionRuns.id, executionId))
					.get();
				tx.update(executionInputs)
					.set({ status: "unconfirmed", deliveryState: "unconfirmed" })
					.where(eq(executionInputs.id, input.inputId))
					.run();
				if (
					!current ||
					current.cancelRequestedAt ||
					TERMINAL_STATUSES.includes(current.status as AutomationRunStatus)
				)
					return;
				tx.update(executionRuns)
					.set({ status: "unknown", stage: "input_delivery_unconfirmed" })
					.where(eq(executionRuns.id, executionId))
					.run();
				tx.update(automationRuns)
					.set({ status: "unknown", reason: "input_delivery_unconfirmed" })
					.where(eq(automationRuns.id, runId))
					.run();
			});
			return getRun({ id: runId });
		}
		try {
			await handle.answerInput(input.inputId, input.answer);
			options.db.transaction((tx) => {
				const current = tx
					.select()
					.from(executionRuns)
					.where(eq(executionRuns.id, executionId))
					.get();
				tx.update(executionInputs)
					.set({ deliveryState: "delivered" })
					.where(eq(executionInputs.id, input.inputId))
					.run();
				if (
					!current ||
					current.cancelRequestedAt ||
					TERMINAL_STATUSES.includes(current.status as AutomationRunStatus)
				)
					return;
				tx.update(executionRuns)
					.set({ status: "running", stage: "agent" })
					.where(eq(executionRuns.id, executionId))
					.run();
				tx.update(automationRuns)
					.set({ status: "running" })
					.where(eq(automationRuns.id, runId))
					.run();
			});
		} catch {
			options.db.transaction((tx) => {
				const current = tx
					.select()
					.from(executionRuns)
					.where(eq(executionRuns.id, executionId))
					.get();
				tx.update(executionInputs)
					.set({ status: "unconfirmed", deliveryState: "unconfirmed" })
					.where(eq(executionInputs.id, input.inputId))
					.run();
				if (
					!current ||
					current.cancelRequestedAt ||
					TERMINAL_STATUSES.includes(current.status as AutomationRunStatus)
				)
					return;
				tx.update(executionRuns)
					.set({ status: "unknown", stage: "input_delivery_unconfirmed" })
					.where(eq(executionRuns.id, executionId))
					.run();
				tx.update(automationRuns)
					.set({ status: "unknown", reason: "input_delivery_unconfirmed" })
					.where(eq(automationRuns.id, runId))
					.run();
			});
		}
		return getRun({ id: runId });
	}

	async function cancelExecution(executionId: string): Promise<void> {
		const controller = abortControllers.get(executionId);
		if (controller) {
			controller.abort();
			return;
		}
		const handle = handles.get(executionId);
		if (!handle) {
			const execution = options.db
				.select()
				.from(executionRuns)
				.where(eq(executionRuns.id, executionId))
				.get();
			if (!execution) return;
			const prepare = options.db
				.select()
				.from(executionOperations)
				.where(
					and(
						eq(executionOperations.executionId, executionId),
						eq(executionOperations.kind, "prepare"),
					),
				)
				.get();
			const dispatch = options.db
				.select()
				.from(executionOperations)
				.where(
					and(
						eq(executionOperations.executionId, executionId),
						eq(executionOperations.kind, "dispatch"),
					),
				)
				.get();
			if (
				(prepare?.state === "pending" || prepare?.state === "completed") &&
				dispatch?.state === "pending"
			) {
				finalizeExecution(
					executionId,
					"cancelled",
					"cancelled_before_dispatch",
				);
			} else {
				markUnknown(executionId, "stop_unconfirmed");
			}
			return;
		}
		try {
			const result = await handle.cancel();
			if (result.quiescent)
				finalizeExecution(executionId, "cancelled", "cancelled");
			else markUnknown(executionId, "stop_unconfirmed");
		} catch {
			markUnknown(executionId, "stop_unconfirmed");
		}
	}

	function markUnknown(executionId: string, reason: string): void {
		options.db.transaction((tx) => {
			const execution = tx
				.select()
				.from(executionRuns)
				.where(eq(executionRuns.id, executionId))
				.get();
			if (
				!execution ||
				TERMINAL_STATUSES.includes(execution.status as AutomationRunStatus)
			)
				return;
			tx.update(executionRuns)
				.set({ status: "unknown", stage: reason })
				.where(eq(executionRuns.id, executionId))
				.run();
			tx.update(automationRuns)
				.set({ status: "unknown", reason })
				.where(eq(automationRuns.id, execution.runId))
				.run();
			emit(tx, "execution.unknown", execution.automationId, execution.runId);
		});
	}

	function finalizeExecution(
		executionId: string,
		status: AutomationRunStatus,
		reason?: string,
	): void {
		if (!TERMINAL_STATUSES.includes(status)) {
			throw new Error(`Cannot finalize execution as ${status}`);
		}
		const finishedAt = now();
		options.db.transaction((tx) => {
			const execution = tx
				.select()
				.from(executionRuns)
				.where(eq(executionRuns.id, executionId))
				.get();
			if (
				!execution ||
				(TERMINAL_STATUSES.includes(execution.status as AutomationRunStatus) &&
					!(execution.status === "needs_result" && status !== "needs_result"))
			)
				return;
			const run = getRunRow(tx, execution.runId);
			const terminalAt = execution.finishedAt ?? finishedAt;
			tx.update(executionRuns)
				.set({
					status,
					stage: status === "needs_result" ? "needs_result" : "finished",
					finishedAt: terminalAt,
					automationOccupancy: null,
					workspaceOccupancy: null,
				})
				.where(eq(executionRuns.id, executionId))
				.run();
			tx.update(automationRuns)
				.set({ status, reason, finishedAt: terminalAt })
				.where(eq(automationRuns.id, run.id))
				.run();
			if (run.source === "scheduled" && execution.status !== "needs_result") {
				const automation = requireAutomation(tx, execution.automationId);
				const scheduleDefinition = definitionFor(
					tx,
					automation.id,
					automation.currentRevision,
				);
				if (
					scheduleDefinition.schedule.kind === "afterCompletion" &&
					automation.state !== "archived"
				) {
					const next = scheduleAfterCompletion(scheduleDefinition, terminalAt);
					const exhausted =
						scheduleDefinition.stop.maxRounds != null &&
						automation.usedRounds >= scheduleDefinition.stop.maxRounds;
					const beyondEnd = Boolean(
						next?.at &&
							scheduleDefinition.stop.endsBefore &&
							Date.parse(next.at) >=
								Date.parse(scheduleDefinition.stop.endsBefore),
					);
					const abnormalContinuous =
						scheduleDefinition.schedule.intervalSeconds === 0 &&
						status !== "succeeded" &&
						!(status === "skipped" && reason === "precheck_false");
					const shouldAdvance = automation.state === "enabled";
					const nextState = abnormalContinuous
						? "paused"
						: shouldAdvance && (exhausted || beyondEnd || !next)
							? "finished"
							: automation.state;
					tx.update(automations)
						.set({
							lastFinishedAt: terminalAt,
							nextDueAt:
								shouldAdvance &&
								!abnormalContinuous &&
								!exhausted &&
								!beyondEnd &&
								next
									? occurrenceCursor(next)
									: null,
							state: nextState,
							updatedAt: terminalAt,
						})
						.where(eq(automations.id, automation.id))
						.run();
					if (abnormalContinuous)
						emit(tx, "automation.paused_after_failure", automation.id, run.id);
				}
			}
			emit(tx, `run.${status}`, execution.automationId, execution.runId);
		});
		handles.delete(executionId);
		abortControllers.delete(executionId);
	}

	async function observeExecution(
		executionId: string,
		event: ExecutionDriverEvent,
	): Promise<void> {
		if (event.type === "started") {
			options.db.transaction((tx) => {
				const execution = tx
					.select()
					.from(executionRuns)
					.where(eq(executionRuns.id, executionId))
					.get();
				if (
					!execution ||
					execution.cancelRequestedAt ||
					TERMINAL_STATUSES.includes(execution.status as AutomationRunStatus)
				)
					return;
				tx.update(executionRuns)
					.set({
						status: "running",
						stage: "agent",
						chatSessionId: event.chatSessionId,
						providerSessionId: event.providerSessionId,
						startedAt: execution.startedAt ?? now(),
					})
					.where(eq(executionRuns.id, executionId))
					.run();
				tx.update(automationRuns)
					.set({ status: "running", startedAt: execution.startedAt ?? now() })
					.where(eq(automationRuns.id, execution.runId))
					.run();
				tx.update(executionOperations)
					.set({
						state: "acknowledged",
						receipt: stableJson({
							chatSessionId: event.chatSessionId,
							providerSessionId: event.providerSessionId,
						}),
						updatedAt: now(),
					})
					.where(
						and(
							eq(executionOperations.executionId, executionId),
							eq(executionOperations.kind, "dispatch"),
						),
					)
					.run();
				emit(tx, "execution.started", execution.automationId, execution.runId);
			});
			return;
		}
		if (event.type === "report") {
			const report = executionReportSchema.parse(event.report);
			options.db.transaction((tx) => {
				const execution = tx
					.select()
					.from(executionRuns)
					.where(eq(executionRuns.id, executionId))
					.get();
				if (!execution) return;
				const encoded = stableJson(report);
				if (execution.report) {
					if (execution.report !== encoded)
						throw new AutomationRuntimeError(
							"REQUEST_CONFLICT",
							"A different result was already reported for this execution",
						);
					return;
				}
				tx.update(executionRuns)
					.set({ report: encoded, stage: "result_submitted" })
					.where(eq(executionRuns.id, executionId))
					.run();
				emit(tx, "execution.reported", execution.automationId, execution.runId);
			});
			const reportedExecution = options.db
				.select()
				.from(executionRuns)
				.where(eq(executionRuns.id, executionId))
				.get();
			if (
				reportedExecution?.status === "needs_result" &&
				!reportedExecution.cancelRequestedAt
			) {
				const pendingInput = options.db
					.select({ id: executionInputs.id })
					.from(executionInputs)
					.where(
						and(
							eq(executionInputs.executionId, executionId),
							eq(executionInputs.status, "pending"),
						),
					)
					.get();
				if (report.outcome !== "completed" || !pendingInput) {
					finalizeExecution(
						executionId,
						report.outcome === "completed" ? "succeeded" : "failed",
						report.outcome === "failed" ? "agent_reported_failure" : undefined,
					);
				}
			}
			return;
		}
		if (event.type === "input") {
			options.db.transaction((tx) => {
				const execution = tx
					.select()
					.from(executionRuns)
					.where(eq(executionRuns.id, executionId))
					.get();
				if (
					!execution ||
					TERMINAL_STATUSES.includes(execution.status as AutomationRunStatus)
				)
					return;
				const existing = tx
					.select()
					.from(executionInputs)
					.where(eq(executionInputs.id, event.id))
					.get();
				if (existing) {
					if (
						existing.executionId !== executionId ||
						existing.question !== event.question ||
						existing.kind !== event.kind
					) {
						tx.update(executionRuns)
							.set({ status: "unknown", stage: "input_identity_conflict" })
							.where(eq(executionRuns.id, executionId))
							.run();
						tx.update(automationRuns)
							.set({ status: "unknown", reason: "input_identity_conflict" })
							.where(eq(automationRuns.id, execution.runId))
							.run();
						emit(
							tx,
							"execution.unknown",
							execution.automationId,
							execution.runId,
						);
					}
					return;
				}
				tx.insert(executionInputs)
					.values({
						id: event.id,
						executionId,
						kind: event.kind,
						question: event.question,
						options: event.options ? stableJson(event.options) : null,
						status: "pending",
						version: 1,
						createdAt: now(),
					})
					.run();
				tx.update(executionRuns)
					.set({ status: "waiting", stage: "waiting_input" })
					.where(eq(executionRuns.id, executionId))
					.run();
				tx.update(automationRuns)
					.set({ status: "waiting" })
					.where(eq(automationRuns.id, execution.runId))
					.run();
				emit(
					tx,
					"execution.input_requested",
					execution.automationId,
					execution.runId,
				);
			});
			return;
		}
		if (event.type === "unknown") {
			markUnknown(executionId, event.reason);
			return;
		}
		const execution = options.db
			.select()
			.from(executionRuns)
			.where(eq(executionRuns.id, executionId))
			.get();
		if (!execution) return;
		if (!event.quiescent) {
			markUnknown(executionId, event.reason ?? "provider_end_unconfirmed");
			return;
		}
		if (execution.cancelRequestedAt || event.outcome === "interrupted") {
			finalizeExecution(
				executionId,
				"cancelled",
				event.reason ?? "interrupted",
			);
			return;
		}
		if (event.outcome === "failed") {
			finalizeExecution(
				executionId,
				"failed",
				event.reason ?? "provider_failed",
			);
			return;
		}
		const refreshed = options.db
			.select()
			.from(executionRuns)
			.where(eq(executionRuns.id, executionId))
			.get();
		if (!refreshed?.report) {
			finalizeExecution(
				executionId,
				"needs_result",
				"provider_ended_without_report",
			);
			return;
		}
		const report = executionReportSchema.parse(JSON.parse(refreshed.report));
		const pendingInput = options.db
			.select({ id: executionInputs.id })
			.from(executionInputs)
			.where(
				and(
					eq(executionInputs.executionId, executionId),
					eq(executionInputs.status, "pending"),
				),
			)
			.get();
		if (report.outcome === "completed" && pendingInput) {
			finalizeExecution(executionId, "needs_result", "unresolved_inputs");
			return;
		}
		finalizeExecution(
			executionId,
			report.outcome === "completed" ? "succeeded" : "failed",
			report.outcome === "failed" ? "agent_reported_failure" : undefined,
		);
	}

	function launchPump(executionId: string): void {
		void pumpExecution(executionId).catch(() => {
			try {
				markUnknown(executionId, "runtime_dispatch_failed");
			} catch {
				// A database failure cannot be recorded, but must not become an unhandled rejection.
			}
		});
	}

	async function pumpExecution(executionId: string): Promise<void> {
		if (pumping.has(executionId)) return;
		pumping.add(executionId);
		try {
			const execution = options.db
				.select()
				.from(executionRuns)
				.where(eq(executionRuns.id, executionId))
				.get();
			if (
				!execution ||
				execution.cancelRequestedAt ||
				execution.status === "unknown" ||
				TERMINAL_STATUSES.includes(execution.status as AutomationRunStatus)
			)
				return;
			const definition = definitionFor(
				options.db,
				execution.automationId,
				execution.definitionRevision,
			);
			const prepareOperation = options.db
				.select()
				.from(executionOperations)
				.where(
					and(
						eq(executionOperations.executionId, executionId),
						eq(executionOperations.kind, "prepare"),
					),
				)
				.get();
			if (!prepareOperation) throw new Error("Missing preparation operation");
			let prepared: Awaited<
				ReturnType<AutomationRuntimeOptions["prepareExecution"]>
			>;
			if (prepareOperation.state === "completed") {
				markUnknown(executionId, "prepared_environment_unavailable");
				return;
			} else if (prepareOperation.state === "pending") {
				const claimed = options.db.transaction((tx) => {
					const result = tx
						.update(executionOperations)
						.set({ state: "dispatching", updatedAt: now() })
						.where(
							and(
								eq(executionOperations.id, prepareOperation.id),
								eq(executionOperations.state, "pending"),
							),
						)
						.run();
					if (result.changes !== 1) return false;
					tx.update(executionRuns)
						.set({ stage: "preparing" })
						.where(eq(executionRuns.id, executionId))
						.run();
					return true;
				});
				if (!claimed) return;
				const controller = new AbortController();
				abortControllers.set(executionId, controller);
				try {
					prepared = await options.prepareExecution({
						executionId,
						workspaceId: execution.workspaceId ?? "",
						definition,
						signal: controller.signal,
						onStage: async (stage, workspaceId, evidence) => {
							options.db.transaction((tx) => {
								const current = tx
									.select()
									.from(executionRuns)
									.where(eq(executionRuns.id, executionId))
									.get();
								if (!current) return;
								if (workspaceId && current.workspaceOccupancy !== workspaceId) {
									if (activeOccupancy(tx, "__none__", workspaceId))
										throw new AutomationRuntimeError(
											"RUN_BUSY",
											"Workspace already has an active managed execution",
										);
								}
								const previousEvidence = current.preparationEvidence
									? (JSON.parse(
											current.preparationEvidence,
										) as ExecutionStageEvidence[])
									: [];
								const nextEvidence = evidence
									? [
											...previousEvidence.filter(
												(item) => item.stage !== stage,
											),
											boundedEvidence(stage, evidence),
										].slice(-10)
									: previousEvidence;
								tx.update(executionRuns)
									.set({
										stage: current.cancelRequestedAt ? current.stage : stage,
										workspaceId: workspaceId ?? current.workspaceId,
										workspaceOccupancy:
											workspaceId ?? current.workspaceOccupancy,
										preparationEvidence: nextEvidence.length
											? stableJson(nextEvidence)
											: current.preparationEvidence,
									})
									.where(eq(executionRuns.id, executionId))
									.run();
							});
						},
					});
				} catch (error) {
					if (controller.signal.aborted) {
						if (error instanceof ExecutionPreparationError && error.quiescent) {
							finalizeExecution(
								executionId,
								"cancelled",
								"preparation_cancelled",
							);
						} else {
							markUnknown(executionId, "preparation_stop_unconfirmed");
						}
					} else if (error instanceof ExecutionPreparationError) {
						if (error.outcome === "unknown")
							markUnknown(executionId, error.stage);
						else
							finalizeExecution(
								executionId,
								error.outcome === "skipped" ? "skipped" : "failed",
								error.outcome === "skipped" && error.stage === "precheck"
									? "precheck_false"
									: error.message,
							);
					} else {
						finalizeExecution(executionId, "failed", "preparation_failed");
					}
					return;
				} finally {
					abortControllers.delete(executionId);
				}
				options.db.transaction((tx) => {
					const current = tx
						.select()
						.from(executionRuns)
						.where(eq(executionRuns.id, executionId))
						.get();
					if (!current) return;
					if (current.workspaceOccupancy !== prepared.workspaceId) {
						if (activeOccupancy(tx, "__none__", prepared.workspaceId))
							throw new AutomationRuntimeError(
								"RUN_BUSY",
								"Workspace already has an active managed execution",
							);
					}
					tx.update(executionRuns)
						.set({
							workspaceId: prepared.workspaceId,
							workspaceOccupancy: prepared.workspaceId,
							stage: current.cancelRequestedAt ? current.stage : "prepared",
						})
						.where(eq(executionRuns.id, executionId))
						.run();
					tx.update(executionOperations)
						.set({
							state: "completed",
							receipt: stableJson({ workspaceId: prepared.workspaceId }),
							updatedAt: now(),
						})
						.where(
							and(
								eq(executionOperations.id, prepareOperation.id),
								eq(executionOperations.state, "dispatching"),
							),
						)
						.run();
				});
			} else {
				markUnknown(executionId, "preparation_dispatch_unconfirmed");
				return;
			}
			const latest = options.db
				.select()
				.from(executionRuns)
				.where(eq(executionRuns.id, executionId))
				.get();
			if (!latest || latest.cancelRequestedAt) {
				await cancelExecution(executionId);
				return;
			}
			const dispatch = options.db
				.select()
				.from(executionOperations)
				.where(
					and(
						eq(executionOperations.executionId, executionId),
						eq(executionOperations.kind, "dispatch"),
					),
				)
				.get();
			if (!dispatch) throw new Error("Missing dispatch operation");
			if (dispatch.state !== "pending") {
				if (dispatch.state === "dispatching")
					markUnknown(executionId, "provider_dispatch_unconfirmed");
				return;
			}
			const dispatchClaimed = options.db.transaction((tx) => {
				const result = tx
					.update(executionOperations)
					.set({ state: "dispatching", updatedAt: now() })
					.where(
						and(
							eq(executionOperations.id, dispatch.id),
							eq(executionOperations.state, "pending"),
						),
					)
					.run();
				if (result.changes !== 1) return false;
				tx.update(executionRuns)
					.set({ stage: "dispatching" })
					.where(eq(executionRuns.id, executionId))
					.run();
				return true;
			});
			if (!dispatchClaimed) return;
			try {
				const handle = await options.driver.start(
					{ executionId, operationId: dispatch.id, definition, prepared },
					(event) => observeExecution(executionId, event),
				);
				let keepHandle = false;
				let cancelAfterStart = false;
				options.db.transaction((tx) => {
					const current = tx
						.select()
						.from(executionRuns)
						.where(eq(executionRuns.id, executionId))
						.get();
					if (!current) return;
					tx.update(executionOperations)
						.set({
							state: "acknowledged",
							receipt: stableJson({
								chatSessionId: handle.chatSessionId,
								providerSessionId: handle.providerSessionId,
							}),
							updatedAt: now(),
						})
						.where(eq(executionOperations.id, dispatch.id))
						.run();
					if (TERMINAL_STATUSES.includes(current.status as AutomationRunStatus))
						return;
					keepHandle = true;
					cancelAfterStart = current.cancelRequestedAt != null;
					tx.update(executionRuns)
						.set({
							chatSessionId: handle.chatSessionId,
							providerSessionId: handle.providerSessionId,
							status:
								current.status === "preparing" ? "running" : current.status,
							stage: current.stage === "dispatching" ? "agent" : current.stage,
							startedAt: current.startedAt ?? now(),
						})
						.where(eq(executionRuns.id, executionId))
						.run();
					tx.update(automationRuns)
						.set({
							status:
								current.status === "preparing" ? "running" : current.status,
							startedAt: current.startedAt ?? now(),
						})
						.where(eq(automationRuns.id, current.runId))
						.run();
				});
				if (keepHandle) handles.set(executionId, handle);
				if (cancelAfterStart) await cancelExecution(executionId);
			} catch {
				markUnknown(executionId, "provider_dispatch_unconfirmed");
			}
		} finally {
			pumping.delete(executionId);
		}
	}

	async function reconcile(): Promise<void> {
		const active = options.db
			.select()
			.from(executionRuns)
			.where(isNotNull(executionRuns.automationOccupancy))
			.all();
		for (const execution of active) {
			if (pumping.has(execution.id) || abortControllers.has(execution.id))
				continue;
			const prepare = options.db
				.select()
				.from(executionOperations)
				.where(
					and(
						eq(executionOperations.executionId, execution.id),
						eq(executionOperations.kind, "prepare"),
					),
				)
				.get();
			const dispatch = options.db
				.select()
				.from(executionOperations)
				.where(
					and(
						eq(executionOperations.executionId, execution.id),
						eq(executionOperations.kind, "dispatch"),
					),
				)
				.get();
			if (handles.has(execution.id)) continue;
			if (!prepare || !dispatch) {
				markUnknown(execution.id, "operation_record_missing");
				continue;
			}
			if (
				prepare.state === "pending" ||
				(prepare.state === "completed" && dispatch.state === "pending")
			) {
				launchPump(execution.id);
				continue;
			}
			if (prepare.state === "dispatching") {
				markUnknown(execution.id, "preparation_dispatch_unconfirmed");
				continue;
			}
			try {
				const inspection = await options.driver.inspect({
					executionId: execution.id,
					operationId: dispatch.id,
					chatSessionId: execution.chatSessionId ?? undefined,
					providerSessionId: execution.providerSessionId ?? undefined,
				});
				if (inspection.state === "running") continue;
				if (inspection.state === "unknown") {
					markUnknown(execution.id, "provider_state_unknown");
					continue;
				}
				if (inspection.report)
					await observeExecution(execution.id, {
						type: "report",
						report: inspection.report,
					});
				await observeExecution(execution.id, {
					type: "ended",
					outcome: inspection.outcome ?? "failed",
					quiescent: inspection.quiescent === true,
					reason: "reconciled_provider_end",
				});
			} catch {
				markUnknown(execution.id, "provider_reconcile_failed");
			}
		}
	}

	function scheduleFinished(
		definition: AutomationDefinition,
		usedRounds: number,
		occurrence?: AutomationOccurrence | null,
	): boolean {
		if (
			definition.stop.maxRounds != null &&
			usedRounds >= definition.stop.maxRounds
		)
			return true;
		if (!occurrence) return definition.schedule.kind !== "afterCompletion";
		if (
			occurrence.at &&
			definition.stop.endsBefore &&
			Date.parse(occurrence.at) >= Date.parse(definition.stop.endsBefore)
		)
			return true;
		return false;
	}

	async function processDueAutomation(
		id: string,
		currentTime: number,
	): Promise<void> {
		for (let batchIndex = 0; batchIndex < SCHEDULER_BATCH; batchIndex += 1) {
			const row = requireAutomation(options.db, id);
			if (
				row.state !== "enabled" ||
				row.nextDueAt == null ||
				row.nextDueAt > currentTime
			)
				return;
			const definition = definitionFor(options.db, row.id, row.currentRevision);
			if (
				definition.stop.endsBefore &&
				currentTime >= Date.parse(definition.stop.endsBefore)
			) {
				options.db
					.update(automations)
					.set({ state: "finished", nextDueAt: null, updatedAt: currentTime })
					.where(eq(automations.id, row.id))
					.run();
				return;
			}
			const occurrence = scheduleAfter(
				definition,
				row.scheduleCursor ?? row.nextDueAt - 1,
				row.lastFinishedAt ?? undefined,
			);
			if (!occurrence) {
				options.db
					.update(automations)
					.set({ state: "finished", nextDueAt: null, updatedAt: currentTime })
					.where(eq(automations.id, row.id))
					.run();
				return;
			}
			const dueAt = occurrenceCursor(occurrence);
			if (dueAt == null) {
				markAutomationInvalid(id, "dst_gap_cursor_missing");
				return;
			}
			if (dueAt > currentTime) {
				options.db
					.update(automations)
					.set({ nextDueAt: dueAt })
					.where(eq(automations.id, row.id))
					.run();
				return;
			}
			const next = scheduleAfter(
				definition,
				dueAt,
				row.lastFinishedAt ?? undefined,
			);
			const remainingAfterCurrent =
				definition.stop.maxRounds == null
					? Number.POSITIVE_INFINITY
					: definition.stop.maxRounds - (row.usedRounds + 1);
			const moreDue =
				remainingAfterCurrent > 0 &&
				next != null &&
				occurrenceCursor(next) != null &&
				occurrenceCursor(next)! <= currentTime;
			const outsideWindow =
				currentTime - dueAt > definition.missedRunWindowSeconds * 1_000;
			const reason =
				occurrence.kind === "dst_gap"
					? "dst_gap"
					: outsideWindow
						? "missed_window"
						: moreDue
							? "coalesced"
							: undefined;
			let acceptedExecutionId: string | undefined;
			options.db.transaction((tx) => {
				const locked = requireAutomation(tx, row.id);
				if (
					locked.version !== row.version ||
					locked.scheduleCursor !== row.scheduleCursor ||
					locked.state !== "enabled"
				)
					return;
				const usedRounds = locked.usedRounds + 1;
				let finalReason = reason;
				if (!finalReason) {
					const workspaceId =
						definition.target.kind === "existingWorkspace"
							? definition.target.workspaceId
							: undefined;
					finalReason = activeOccupancy(tx, row.id, workspaceId);
				}
				if (finalReason) {
					recordSkipped(tx, {
						automationId: row.id,
						revision: row.currentRevision,
						plannedAt: occurrence.at ? Date.parse(occurrence.at) : null,
						occurrenceKey: occurrence.key,
						reason: finalReason,
					});
				} else {
					const accepted = acceptExecution(tx, {
						automationId: row.id,
						revision: row.currentRevision,
						definition,
						source: "scheduled",
						plannedAt: occurrence.at ? Date.parse(occurrence.at) : null,
						occurrenceKey: occurrence.key,
					});
					acceptedExecutionId = accepted.executionId;
				}
				const effectiveNext =
					definition.schedule.kind === "afterCompletion" && finalReason
						? scheduleAfterCompletion(definition, currentTime)
						: next;
				let nextDueAt =
					definition.schedule.kind === "afterCompletion"
						? finalReason
							? effectiveNext
								? occurrenceCursor(effectiveNext)
								: null
							: null
						: effectiveNext
							? occurrenceCursor(effectiveNext)
							: null;
				let state = locked.state;
				if (
					scheduleFinished(definition, usedRounds, effectiveNext) ||
					(definition.schedule.kind === "afterCompletion" &&
						Boolean(finalReason) &&
						!effectiveNext)
				) {
					state = "finished";
					nextDueAt = null;
				}
				const nextLastFinishedAt =
					definition.schedule.kind === "afterCompletion" && finalReason
						? currentTime
						: locked.lastFinishedAt;
				if (
					definition.schedule.kind === "afterCompletion" &&
					definition.schedule.intervalSeconds === 0 &&
					finalReason &&
					finalReason !== "precheck_false"
				) {
					state = "paused";
					nextDueAt = null;
				}
				tx.update(automations)
					.set({
						usedRounds,
						scheduleCursor: dueAt,
						nextDueAt,
						lastFinishedAt: nextLastFinishedAt,
						state,
						updatedAt: currentTime,
					})
					.where(
						and(
							eq(automations.id, row.id),
							eq(automations.version, row.version),
						),
					)
					.run();
			});
			if (acceptedExecutionId) launchPump(acceptedExecutionId);
			if (!moreDue) return;
		}
	}

	function markAutomationInvalid(id: string, reason: string): void {
		options.db.transaction((tx) => {
			const row = requireAutomation(tx, id);
			tx.update(automations)
				.set({ state: "paused", nextDueAt: null, updatedAt: now() })
				.where(eq(automations.id, id))
				.run();
			emit(tx, `automation.${reason}`, row.id);
		});
	}

	async function tick(): Promise<void> {
		if (ticking) return ticking;
		ticking = (async () => {
			await reconcile();
			const currentTime = now();
			const resumable = options.db
				.select()
				.from(automations)
				.where(
					and(
						eq(automations.state, "paused"),
						isNotNull(automations.resumeAt),
						lte(automations.resumeAt, currentTime),
					),
				)
				.all();
			for (const row of resumable) {
				const definition = definitionFor(
					options.db,
					row.id,
					row.currentRevision,
				);
				const resumeBoundary = row.resumeAt ?? currentTime;
				options.db.transaction((tx) => {
					const current = requireAutomation(tx, row.id);
					if (current.state !== "paused" || current.resumeAt !== row.resumeAt)
						return;
					const activationAt =
						definition.schedule.kind === "afterCompletion"
							? currentTime
							: resumeBoundary;
					const activation = activationSchedule(
						tx,
						current,
						definition,
						activationAt,
					);
					const exhausted =
						definition.stop.maxRounds != null &&
						current.usedRounds >= definition.stop.maxRounds;
					const expiredOnce =
						definition.schedule.kind === "once" && !activation.next;
					const state = expiredOnce
						? "paused"
						: (activation.next || activation.waitsForActiveCompletion) &&
								!exhausted
							? "enabled"
							: "finished";
					tx.update(automations)
						.set({
							state,
							resumeAt: null,
							scheduleCursor: activation.scheduleCursor,
							lastFinishedAt: activation.lastFinishedAt,
							nextDueAt:
								state === "enabled" && activation.next
									? occurrenceCursor(activation.next)
									: null,
							version: current.version + 1,
							updatedAt: currentTime,
						})
						.where(eq(automations.id, row.id))
						.run();
					emit(
						tx,
						expiredOnce ? "automation.resume_expired" : "automation.resumed",
						row.id,
					);
				});
			}
			const due = options.db
				.select({ id: automations.id })
				.from(automations)
				.where(
					and(
						eq(automations.state, "enabled"),
						isNotNull(automations.nextDueAt),
						lte(automations.nextDueAt, currentTime),
					),
				)
				.orderBy(asc(automations.nextDueAt))
				.all();
			for (const row of due) await processDueAutomation(row.id, currentTime);
		})().finally(() => {
			ticking = undefined;
		});
		return ticking;
	}

	function scheduleTimer(): void {
		if (!started) return;
		timer = setTimeout(async () => {
			try {
				await tick();
			} finally {
				scheduleTimer();
			}
		}, 1_000);
		timer.unref?.();
	}

	async function start(): Promise<void> {
		if (started) return;
		await reconcile();
		started = true;
		await tick();
		scheduleTimer();
	}

	async function stop(): Promise<void> {
		started = false;
		clearTimeout(timer);
		timer = undefined;
		await options.driver.dispose();
	}

	return {
		capabilities: () => ({
			harnesses: ["claude-code", "codex"],
			scheduleKinds: [
				"immediate",
				"once",
				"calendar",
				"fixedInterval",
				"afterCompletion",
			],
			maxPageSize: 100,
		}),
		preview,
		create,
		update,
		setScheduleState,
		archive,
		runNow,
		retryRun,
		get,
		list,
		getRun,
		listRuns,
		readEvents,
		requestCancel,
		answerInput,
		start,
		stop,
		tick,
	};
}
