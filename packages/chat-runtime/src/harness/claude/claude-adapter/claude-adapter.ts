import { randomUUID } from "node:crypto";
import {
	createSdkMcpServer,
	type SDKUserMessage,
	type query as sdkQuery,
	tool,
} from "@anthropic-ai/claude-agent-sdk";
import type {
	ApprovalRequest,
	Decision,
	UserContent,
} from "@choros/chat/protocol";
import type {
	AdapterEvent,
	HarnessAdapter,
	HarnessStartOptions,
} from "../../types";
import { ClaudeTranslator } from "../translate-stream";

type SdkParams = Parameters<typeof sdkQuery>[0];
type SdkOptions = NonNullable<SdkParams["options"]>;

/**
 * Input positions are the SDK's own types: widening them (a bare `string`
 * permissionMode, an `AsyncIterable<unknown>` prompt) type-checks against the
 * real `query` only through a cast, and the cast is what hid the mismatch.
 */
export type ClaudeQueryOptions = Pick<
	SdkOptions,
	| "abortController"
	| "canUseTool"
	| "cwd"
	| "env"
	| "includePartialMessages"
	| "mcpServers"
	| "model"
	| "pathToClaudeCodeExecutable"
	| "permissionMode"
	| "resume"
	| "settingSources"
>;

type PermissionResult = Awaited<
	ReturnType<NonNullable<SdkOptions["canUseTool"]>>
>;

export type ClaudeSession = AsyncIterable<unknown> & {
	interrupt?: () => Promise<void>;
};

export type ClaudeQuery = (params: {
	prompt: SdkParams["prompt"];
	options: ClaudeQueryOptions;
}) => ClaudeSession;

export type ClaudeAdapterOptions = {
	query: ClaudeQuery;
	pathToClaudeCodeExecutable?: string;
	now?: () => number;
	mintId?: () => string;
};

type PendingApproval = {
	toolUseId: string;
	input: Record<string, unknown>;
	settle: (result: PermissionResult) => void;
	requiresApproval: boolean;
	toolName: string;
};

class EventQueue {
	private readonly buffered: AdapterEvent[] = [];
	private waiting: ((result: IteratorResult<AdapterEvent>) => void) | null =
		null;
	private closed = false;

	push(event: AdapterEvent): void {
		if (this.closed) return;
		const waiting = this.waiting;
		if (waiting) {
			this.waiting = null;
			waiting({ value: event, done: false });
			return;
		}
		this.buffered.push(event);
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		const waiting = this.waiting;
		if (waiting) {
			this.waiting = null;
			waiting({ value: undefined, done: true });
		}
	}

	next(): Promise<IteratorResult<AdapterEvent>> {
		const buffered = this.buffered.shift();
		if (buffered) return Promise.resolve({ value: buffered, done: false });
		if (this.closed) return Promise.resolve({ value: undefined, done: true });
		return new Promise((resolve) => {
			this.waiting = resolve;
		});
	}
}

class PromptQueue {
	private readonly buffered: SDKUserMessage[] = [];
	private waiting: ((result: IteratorResult<SDKUserMessage>) => void) | null =
		null;
	private closed = false;

	push(message: SDKUserMessage): void {
		const waiting = this.waiting;
		if (waiting) {
			this.waiting = null;
			waiting({ value: message, done: false });
			return;
		}
		this.buffered.push(message);
	}

	close(): void {
		this.closed = true;
		const waiting = this.waiting;
		if (waiting) {
			this.waiting = null;
			waiting({ value: undefined, done: true });
		}
	}

	async *stream(): AsyncIterable<SDKUserMessage> {
		while (true) {
			const buffered = this.buffered.shift();
			if (buffered) {
				yield buffered;
				continue;
			}
			if (this.closed) return;
			const next = await new Promise<IteratorResult<SDKUserMessage>>(
				(resolve) => {
					this.waiting = resolve;
				},
			);
			if (next.done) return;
			yield next.value;
		}
	}
}

function promptText(content: UserContent[]): string {
	return content
		.map((part) => (part.type === "text" ? part.text : `[${part.name}]`))
		.join("\n");
}

export class ClaudeAdapter implements HarnessAdapter {
	private isManagedTool(toolName: string): boolean {
		return (
			toolName.startsWith("mcp__choros__automations_") ||
			toolName.startsWith("mcp__choros__executions_")
		);
	}

	private managementApprovalOptions(
		toolName: string,
		input: Record<string, unknown>,
	): NonNullable<ApprovalRequest["options"]> {
		const name = toolName.replace(/^mcp__choros__/, "");
		let optionId = "confirm";
		let label = "Confirm once";
		if (name === "automations_create") {
			optionId = input.runImmediately === true ? "confirm_run" : "save_paused";
			label =
				input.runImmediately === true ? "Create and run once" : "Save paused";
		} else if (name === "automations_set_schedule_state") {
			optionId = input.state === "enabled" ? "enable" : "pause";
			label =
				input.state === "enabled"
					? "Enable this schedule"
					: "Pause this schedule";
		}
		return [
			{ optionId, label },
			{ optionId: "deny", label: "Deny" },
		];
	}

	private effectiveDecision(
		pending: PendingApproval,
		decision: Decision,
	): Decision {
		if (!pending.requiresApproval || !this.isManagedTool(pending.toolName)) {
			return decision;
		}
		if (decision.type === "accept_for_session") return { type: "accept" };
		if (decision.type !== "option") return decision;
		const options = this.managementApprovalOptions(
			pending.toolName,
			pending.input,
		);
		if (!options.some((option) => option.optionId === decision.optionId)) {
			return { type: "decline" };
		}
		return decision.optionId === "deny"
			? { type: "decline" }
			: { type: "accept" };
	}
	private readonly events = new EventQueue();
	private readonly prompts = new PromptQueue();
	private readonly approvals = new Map<string, PendingApproval>();
	private readonly abortController = new AbortController();
	private translator: ClaudeTranslator | null = null;
	private session: ClaudeSession | null = null;
	private pump: Promise<void> | null = null;
	private disposed = false;
	private providerSessionId: string | undefined;

	constructor(private readonly options: ClaudeAdapterOptions) {}

	start(startOptions: HarnessStartOptions): AsyncIterable<AdapterEvent> {
		const translator = new ClaudeTranslator({
			cwd: startOptions.cwd,
			now: this.options.now,
			mintId: this.options.mintId,
		});
		this.translator = translator;
		const controlledTools = new Map(
			(startOptions.tools ?? []).map((definition) => [
				definition.name,
				definition,
			]),
		);
		const mcpServer =
			controlledTools.size === 0
				? undefined
				: createSdkMcpServer({
						name: "choros",
						version: "1.0.0",
						instructions: startOptions.instructions,
						alwaysLoad: true,
						tools: [...controlledTools.values()].map((definition) =>
							tool(
								definition.name,
								definition.description,
								definition.inputSchema.shape,
								async (input) => ({
									content: [
										{
											type: "text",
											text: this.toolResultText(
												await definition.handler(input, {
													callId: this.mintId(),
													providerSessionId: this.providerSessionId,
													providerTurnId: translator.currentTurnId ?? undefined,
												}),
											),
										},
									],
								}),
							),
						),
					});

		const stream = this.options.query({
			prompt: this.prompts.stream(),
			options: {
				cwd: startOptions.cwd,
				model: startOptions.modelId,
				env: startOptions.env,
				pathToClaudeCodeExecutable: this.options.pathToClaudeCodeExecutable,
				includePartialMessages: true,
				settingSources: [],
				...(mcpServer ? { mcpServers: { choros: mcpServer } } : {}),
				permissionMode: "default",
				abortController: this.abortController,
				resume: startOptions.resume?.harnessSessionId,
				canUseTool: (toolName, input, { toolUseID }) => {
					const definition = controlledTools.get(
						toolName.replace(/^mcp__choros__/, ""),
					);
					if (definition?.requiresApproval === false) {
						return Promise.resolve({ behavior: "allow", updatedInput: input });
					}
					return this.requestApproval(
						input,
						toolUseID,
						toolName,
						definition !== undefined,
					);
				},
			},
		});

		this.session = stream;
		this.pump = this.run(stream, translator);
		const events = this.events;
		return {
			[Symbol.asyncIterator](): AsyncIterator<AdapterEvent> {
				return { next: () => events.next() };
			},
		};
	}

	prompt(content: UserContent[]): void {
		this.prompts.push({
			type: "user",
			message: { role: "user", content: promptText(content) },
			parent_tool_use_id: null,
		});
	}

	cancelTurn(): void {
		const interrupt = this.session?.interrupt;
		if (!interrupt) {
			this.abortController.abort();
			return;
		}
		this.translator?.markInterrupted("Turn canceled by user");
		void interrupt.call(this.session).catch(() => {
			this.abortController.abort();
		});
	}

	respondToApproval(approvalId: string, decision: Decision): void {
		const pending = this.approvals.get(approvalId);
		if (!pending) return;
		this.approvals.delete(approvalId);

		const normalizedDecision = this.effectiveDecision(pending, decision);
		if (
			normalizedDecision.type === "accept" ||
			normalizedDecision.type === "accept_for_session"
		) {
			pending.settle({ behavior: "allow", updatedInput: pending.input });
		} else {
			this.translator?.markDeclined(pending.toolUseId);
			pending.settle({
				behavior: "deny",
				message: "User declined this tool call.",
				...(normalizedDecision.type === "cancel" ? { interrupt: true } : {}),
			});
		}

		this.emitApproval(
			approvalId,
			pending.toolUseId,
			"answered",
			decision.type === "accept_for_session" && pending.requiresApproval
				? normalizedDecision
				: decision,
			pending.toolName,
			pending.input,
		);
		if (normalizedDecision.type === "cancel") this.cancelTurn();
	}

	setMode(modeId: string): void {
		this.events.push({ kind: "session", session: { modeId } });
	}

	async dispose(): Promise<{ quiescent: boolean }> {
		this.disposed = true;
		for (const [approvalId, pending] of [...this.approvals]) {
			this.approvals.delete(approvalId);
			pending.settle({ behavior: "deny", message: "Session disposed." });
		}
		this.abortController.abort();
		this.prompts.close();
		await this.pump;
		this.events.close();
		return { quiescent: false };
	}

	private async run(
		stream: AsyncIterable<unknown>,
		translator: ClaudeTranslator,
	): Promise<void> {
		try {
			for await (const message of stream) {
				if (this.disposed) return;
				const raw =
					typeof message === "object" && message !== null
						? (message as Record<string, unknown>)
						: null;
				if (raw?.type === "system" && raw.subtype === "init") {
					this.providerSessionId =
						typeof raw.session_id === "string" ? raw.session_id : undefined;
				}
				for (const event of translator.translate(message)) {
					this.events.push(event);
				}
			}
		} catch (error) {
			const now = (this.options.now ?? Date.now)();
			this.events.push({
				kind: "item",
				item: {
					id: this.mintId(),
					kind: "notice",
					noticeKind: "error",
					text: error instanceof Error ? error.message : String(error),
					startedAtMs: now,
					completedAtMs: now,
				},
				turnId: translator.currentTurnId ?? "unattributed",
			});
			this.events.push({ kind: "session", session: { status: "dead" } });
		}
	}

	private requestApproval(
		input: Record<string, unknown>,
		toolUseId: string,
		toolName: string,
		requiresApproval: boolean,
	): Promise<PermissionResult> {
		const approvalId = this.mintId();
		return new Promise<PermissionResult>((settle) => {
			this.approvals.set(approvalId, {
				toolUseId,
				input,
				settle,
				requiresApproval,
				toolName,
			});
			this.emitApproval(
				approvalId,
				toolUseId,
				"pending",
				undefined,
				toolName,
				input,
			);
		});
	}

	private emitApproval(
		approvalId: string,
		toolUseId: string,
		status: ApprovalRequest["status"],
		decision?: Decision,
		toolName?: string,
		input?: Record<string, unknown>,
	): void {
		const item: ApprovalRequest = {
			id: approvalId,
			kind: "approval_request",
			startedAtMs: this.now(),
			...(status === "pending" ? {} : { completedAtMs: this.now() }),
			targetItemId: toolUseId,
			title: toolName
				? `Allow ${toolName.replace(/^mcp__choros__/, "Automation tool ")} for this request?`
				: "Allow this tool call?",
			...(status === "pending" &&
			toolName &&
			input &&
			this.isManagedTool(toolName)
				? { options: this.managementApprovalOptions(toolName, input) }
				: {}),
			status,
			...(decision ? { decision } : {}),
		};
		this.events.push({
			kind: "item",
			item,
			turnId: this.translator?.currentTurnId ?? "unattributed",
		});
	}

	private toolResultText(value: unknown): string {
		return typeof value === "string" ? value : JSON.stringify(value);
	}

	private now(): number {
		return (this.options.now ?? Date.now)();
	}

	private mintId(): string {
		return (this.options.mintId ?? randomUUID)();
	}
}
