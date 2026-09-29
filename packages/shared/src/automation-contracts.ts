import { z } from "zod";

const instant = z.iso.datetime({ offset: true });
const timeZone = z
	.string()
	.min(1)
	.refine((value) => {
		try {
			new Intl.DateTimeFormat("en", { timeZone: value });
			return true;
		} catch {
			return false;
		}
	}, "Invalid IANA time zone");
export const automationScheduleSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("immediate") }),
	z.object({ kind: z.literal("once"), at: instant, timeZone }),
	z.object({
		kind: z.literal("calendar"),
		rrule: z.string().min(1).max(500),
		startsAt: instant,
		timeZone,
	}),
	z.object({
		kind: z.literal("fixedInterval"),
		startsAt: instant,
		intervalSeconds: z.number().int().min(60),
		timeZone,
	}),
	z.object({
		kind: z.literal("afterCompletion"),
		startsAt: instant,
		intervalSeconds: z.number().int().nonnegative(),
		timeZone,
	}),
]);
export const automationTargetSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("newWorktree"),
		projectId: z.string().uuid(),
		baseRef: z.string().min(1),
	}),
	z.object({
		kind: z.literal("existingWorkspace"),
		workspaceId: z.string().uuid(),
		setupPolicy: z.enum(["everyRun", "prepared"]).default("prepared"),
	}),
]);
export const automationDefinitionSchema = z
	.object({
		name: z.string().trim().min(1).max(200),
		instructions: z.string().trim().min(1).max(65536),
		target: automationTargetSchema,
		executor: z.object({
			harness: z.enum(["claude-code", "codex"]),
			accountRef: z.string().min(1),
			sessionMode: z.enum(["fresh", "reuse"]).default("fresh"),
			sessionId: z.string().min(1).optional(),
			model: z.string().min(1).optional(),
			effort: z.string().min(1).optional(),
		}),
		schedule: automationScheduleSchema,
		stop: z
			.object({
				maxRounds: z.number().int().min(1).max(10000).optional(),
				endsBefore: instant.optional(),
			})
			.default({}),
		missedRunWindowSeconds: z.number().int().min(0).max(86400).default(3600),
		setupTimeoutSeconds: z.number().int().min(1).max(86400).default(600),
		precheck: z
			.object({
				command: z.string().min(1).max(65536),
				timeoutSeconds: z.number().int().min(1).max(300).default(30),
			})
			.optional(),
	})
	.superRefine((definition, ctx) => {
		if (
			definition.executor.sessionMode === "reuse" &&
			!definition.executor.sessionId
		)
			ctx.addIssue({
				code: "custom",
				path: ["executor", "sessionId"],
				message: "Reuse requires a managed session identity",
			});
		if (definition.schedule.kind === "afterCompletion") {
			const interval = definition.schedule.intervalSeconds;
			if (interval > 0 && interval < 60)
				ctx.addIssue({
					code: "custom",
					path: ["schedule", "intervalSeconds"],
					message: "Intervals must be at least 60 seconds",
				});
			if (
				interval === 0 &&
				(!definition.stop.maxRounds || definition.stop.maxRounds > 100)
			)
				ctx.addIssue({
					code: "custom",
					path: ["stop", "maxRounds"],
					message: "Continuous runs require a limit of 1–100 rounds",
				});
		}
	});
export const executionReportSchema = z
	.object({
		outcome: z.enum(["completed", "failed"]),
		summary: z.string().trim().min(1).max(65536),
		artifacts: z
			.array(
				z.object({
					path: z.string().min(1),
					type: z.string().min(1),
					checksum: z.string().optional(),
					byteLength: z.number().int().nonnegative().optional(),
					mutable: z.boolean().optional(),
					missing: z.boolean().optional(),
				}),
			)
			.max(100)
			.default([]),
		verification: z.object({
			status: z.enum(["passed", "failed", "not_run"]),
			reason: z.string().optional(),
			command: z.string().optional(),
			evidenceRef: z.string().optional(),
		}),
	})
	.superRefine((report, ctx) => {
		if (
			report.verification.status === "not_run" &&
			!report.verification.reason?.trim()
		)
			ctx.addIssue({
				code: "custom",
				path: ["verification", "reason"],
				message: "Explain why verification was not performed",
			});
		if (
			report.verification.status !== "not_run" &&
			(!report.verification.command?.trim() ||
				!report.verification.evidenceRef?.trim())
		)
			ctx.addIssue({
				code: "custom",
				path: ["verification"],
				message: "Verification requires a method and evidence reference",
			});
		if (new TextEncoder().encode(JSON.stringify(report)).byteLength > 65536)
			ctx.addIssue({ code: "custom", message: "Result report exceeds 64 KiB" });
	});
export type AutomationDefinition = z.output<typeof automationDefinitionSchema>;
export type AutomationDefinitionInput = z.input<
	typeof automationDefinitionSchema
>;
export type AutomationSchedule = z.infer<typeof automationScheduleSchema>;
export type ExecutionReport = z.output<typeof executionReportSchema>;
export const automationStateSchema = z.enum([
	"paused",
	"enabled",
	"finished",
	"archived",
]);
export type AutomationState = z.infer<typeof automationStateSchema>;
export const automationRunStatusSchema = z.enum([
	"preparing",
	"running",
	"waiting",
	"stopping",
	"succeeded",
	"failed",
	"skipped",
	"cancelled",
	"unknown",
	"needs_result",
]);
export type AutomationRunStatus = z.infer<typeof automationRunStatusSchema>;
export interface ExecutionInput {
	id: string;
	executionId: string;
	kind: "permission" | "question";
	question: string;
	options?: Array<{ id: string; label: string }>;
	status: "pending" | "answered" | "unconfirmed";
	version: number;
	answer?: string;
}
export interface ExecutionStageEvidence {
	stage: string;
	exitCode: number | null;
	output: string;
	truncated: boolean;
	quiescent: boolean;
}
export interface AutomationRun {
	id: string;
	automationId: string;
	definitionRevision: number;
	definition: AutomationDefinition;
	source: "scheduled" | "manual" | "retry";
	status: AutomationRunStatus;
	plannedAt: string | null;
	createdAt: string;
	startedAt: string | null;
	finishedAt: string | null;
	stage?: string;
	reason?: string;
	executionId?: string;
	workspaceId?: string;
	chatSessionId?: string;
	providerSessionId?: string;
	retryOf?: string;
	report?: ExecutionReport;
	inputs: ExecutionInput[];
	preparation?: ExecutionStageEvidence[];
}
export interface Automation {
	id: string;
	revision: number;
	version: number;
	definition: AutomationDefinition;
	state: AutomationState;
	nextRunAt: string | null;
	usedRounds: number;
	createdAt: string;
	updatedAt: string;
	resumeAt?: string | null;
	lastRun?: AutomationRun;
}
export interface AutomationOccurrence {
	at: string | null;
	kind: "due" | "dst_gap";
	localTime?: string;
	key: string;
}
export interface AutomationPreview {
	definition: AutomationDefinition;
	summary: string;
	nextOccurrences: AutomationOccurrence[];
	confirmationToken: string;
	expiresAt: string;
	resolvedAt: string;
}
export interface WorkEvent {
	seq: number;
	automationId?: string;
	runId?: string;
	type: string;
	createdAt: string;
}
export interface AutomationPage<T> {
	items: T[];
	nextCursor: string | null;
	cursor: number;
}
export const requestIdSchema = z.string().min(1).max(200);
export const automationPreviewInputSchema = z.object({
	definition: automationDefinitionSchema,
	automationId: z.string().uuid().optional(),
	expectedVersion: z.number().int().nonnegative().optional(),
	intent: z.enum(["save", "enable", "run"]).default("save"),
});
export const automationCreateInputSchema = z.object({
	requestId: requestIdSchema,
	confirmationToken: z.string().min(1),
	runImmediately: z.boolean().default(false),
});
export const automationUpdateInputSchema = z.object({
	requestId: requestIdSchema,
	id: z.string().uuid(),
	expectedVersion: z.number().int().nonnegative(),
	confirmationToken: z.string().min(1),
});
export const automationSetStateInputSchema = z.object({
	requestId: requestIdSchema,
	id: z.string().uuid(),
	expectedVersion: z.number().int().nonnegative(),
	state: z.enum(["enabled", "paused"]),
	confirmationToken: z.string().optional(),
	resumeAt: instant.nullable().optional(),
});
export const automationArchiveInputSchema = z.object({
	requestId: requestIdSchema,
	id: z.string().uuid(),
	expectedVersion: z.number().int().nonnegative(),
});
export const automationRunNowInputSchema = z.object({
	requestId: requestIdSchema,
	id: z.string().uuid(),
});
export const automationRetryInputSchema = z.object({
	requestId: requestIdSchema,
	runId: z.string().uuid(),
});
export const executionCancelInputSchema = automationRetryInputSchema;
export const executionAnswerInputSchema = z.object({
	requestId: requestIdSchema,
	inputId: z.string().uuid(),
	expectedVersion: z.number().int().nonnegative(),
	answer: z.string().min(1).max(65536),
});
export const automationListInputSchema = z
	.object({
		state: automationStateSchema.optional(),
		limit: z.number().int().min(1).max(100).default(50),
		cursor: z.string().optional(),
		projectIds: z.array(z.string().uuid()).optional(),
		workspaceIds: z.array(z.string().uuid()).optional(),
	})
	.default({ limit: 50 });
export const automationRunsInputSchema = z
	.object({
		automationId: z.string().uuid().optional(),
		status: automationRunStatusSchema.optional(),
		limit: z.number().int().min(1).max(100).default(50),
		cursor: z.string().optional(),
	})
	.default({ limit: 50 });
export const workEventsInputSchema = z
	.object({
		after: z.number().int().nonnegative().default(0),
		limit: z.number().int().min(1).max(100).default(50),
	})
	.default({ after: 0, limit: 50 });
export interface AutomationCapabilities {
	harnesses: Array<"claude-code" | "codex">;
	scheduleKinds: AutomationSchedule["kind"][];
	maxPageSize: number;
}
export interface AutomationClient {
	capabilities(): AutomationCapabilities;
	preview(
		input: z.input<typeof automationPreviewInputSchema>,
	): Promise<AutomationPreview>;
	create(
		input: z.input<typeof automationCreateInputSchema>,
	): Promise<{ automation: Automation; run?: AutomationRun }>;
	update(
		input: z.input<typeof automationUpdateInputSchema>,
	): Promise<Automation>;
	setScheduleState(
		input: z.input<typeof automationSetStateInputSchema>,
	): Promise<Automation>;
	archive(
		input: z.input<typeof automationArchiveInputSchema>,
	): Promise<Automation>;
	runNow(
		input: z.input<typeof automationRunNowInputSchema>,
	): Promise<AutomationRun>;
	retryRun(
		input: z.input<typeof automationRetryInputSchema>,
	): Promise<AutomationRun>;
	get(input: { id: string }): Automation;
	list(
		input?: z.input<typeof automationListInputSchema>,
	): AutomationPage<Automation>;
	getRun(input: { id: string }): AutomationRun;
	listRuns(
		input?: z.input<typeof automationRunsInputSchema>,
	): AutomationPage<AutomationRun>;
	readEvents(input?: z.input<typeof workEventsInputSchema>): {
		events: WorkEvent[];
		cursor: number;
	};
	requestCancel(
		input: z.input<typeof executionCancelInputSchema>,
	): Promise<AutomationRun>;
	answerInput(
		input: z.input<typeof executionAnswerInputSchema>,
	): Promise<AutomationRun>;
}
