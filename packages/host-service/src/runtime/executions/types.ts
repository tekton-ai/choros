import type {
	AutomationDefinition,
	ExecutionReport,
	ExecutionStageEvidence,
	WorkEvent,
} from "@choros/shared/automation-contracts";
import type { HostDb } from "../../db";

export interface PreparedExecution {
	workspaceId: string;
	cwd: string;
	env: Record<string, string>;
	instructions: string;
}
export interface PreparationRequest {
	executionId: string;
	workspaceId: string;
	definition: AutomationDefinition;
	signal: AbortSignal;
	onStage: (
		stage: string,
		workspaceId?: string,
		evidence?: ExecutionStageEvidence,
	) => Promise<void>;
}
export class ExecutionPreparationError extends Error {
	constructor(
		message: string,
		public readonly stage: string,
		public readonly outcome: "failed" | "skipped" | "unknown" = "failed",
		public readonly quiescent = false,
	) {
		super(message);
		this.name = "ExecutionPreparationError";
	}
}
export type ExecutionDriverEvent =
	| { type: "started"; chatSessionId: string; providerSessionId?: string }
	| { type: "report"; report: ExecutionReport }
	| {
			type: "input";
			id: string;
			kind: "permission" | "question";
			question: string;
			options?: Array<{ id: string; label: string }>;
	  }
	| {
			type: "ended";
			outcome: "completed" | "failed" | "interrupted";
			quiescent: boolean;
			reason?: string;
	  }
	| { type: "unknown"; reason: string };
export interface ExecutionDriverRequest {
	executionId: string;
	operationId: string;
	definition: AutomationDefinition;
	prepared: PreparedExecution;
}
export interface ExecutionDriverHandle {
	chatSessionId: string;
	providerSessionId?: string;
	cancel(): Promise<{ quiescent: boolean }>;
	answerInput(id: string, answer: string): Promise<void>;
}
export interface ExecutionInspection {
	state: "running" | "ended" | "unknown";
	quiescent?: boolean;
	outcome?: "completed" | "failed" | "interrupted";
	report?: ExecutionReport;
}
export interface ExecutionDriver {
	start(
		request: ExecutionDriverRequest,
		observe: (event: ExecutionDriverEvent) => Promise<void>,
	): Promise<ExecutionDriverHandle>;
	inspect(input: {
		executionId: string;
		operationId: string;
		chatSessionId?: string;
		providerSessionId?: string;
	}): Promise<ExecutionInspection>;
	dispose(): Promise<void>;
}
export interface AutomationRuntimeOptions {
	db: HostDb;
	driver: ExecutionDriver;
	prepareExecution(request: PreparationRequest): Promise<PreparedExecution>;
	resolveDefinition(
		definition: AutomationDefinition,
	): Promise<AutomationDefinition>;
	now?: () => number;
	notify?: (event: WorkEvent) => void;
}
