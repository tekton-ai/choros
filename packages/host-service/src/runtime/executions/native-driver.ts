import { createHash, randomUUID } from "node:crypto";
import type { ApprovalRequest } from "@choros/chat/protocol";
import type {
	AdapterEvent,
	ChatRuntime,
	HarnessToolDefinition,
	ManagedOperationOutcome,
} from "@choros/chat-runtime";
import {
	executionReportSchema,
	requestIdSchema,
} from "@choros/shared/automation-contracts";
import { z } from "zod";
import type {
	ExecutionDriver,
	ExecutionDriverEvent,
	ExecutionDriverHandle,
	ExecutionDriverRequest,
	ExecutionInspection,
} from "./types";

const reportResultSchema = z.object({
	requestId: requestIdSchema,
	report: executionReportSchema,
});
const requestInputSchema = z.object({
	question: z.string().trim().min(1).max(65536),
	options: z
		.array(z.object({ id: z.string().min(1), label: z.string().min(1) }))
		.max(100)
		.optional(),
});

type PendingInput =
	| {
			kind: "question";
			operationId: string;
			resolve(answer: string): void;
			reject(error: Error): void;
	  }
	| {
			kind: "permission";
			operationId: string;
			providerRequestId: string;
			options?: Array<{ id: string; label: string }>;
	  };

type OwnedExecution = {
	requestHash: string;
	observe?: (event: ExecutionDriverEvent) => Promise<void>;
	pending: Map<string, PendingInput>;
	startedObserved: boolean;
	finalizing?: Promise<{ quiescent: boolean }>;
};

function stableJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	const record = value as Record<string, unknown>;
	return `{${Object.keys(record)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
		.join(",")}}`;
}

function digest(value: unknown): string {
	return createHash("sha256").update(stableJson(value)).digest("hex");
}

function reportEquals(left: unknown, right: unknown): boolean {
	return stableJson(left) === stableJson(right);
}

function executionTargetKey(request: ExecutionDriverRequest): string {
	return `workspace:${request.prepared.workspaceId}`;
}

export function createNativeExecutionDriver(options: {
	runtime: ChatRuntime | (() => ChatRuntime);
}): ExecutionDriver {
	const runtimeOption = options.runtime;
	const getRuntime: () => ChatRuntime =
		typeof runtimeOption === "function" ? runtimeOption : () => runtimeOption;
	const owned = new Map<string, OwnedExecution>();

	const emit = async (
		entry: OwnedExecution,
		event: ExecutionDriverEvent,
	): Promise<void> => {
		await entry.observe?.(event);
	};

	const notifyStarted = async (
		entry: OwnedExecution,
		chatSessionId: string,
		providerSessionId?: string,
	): Promise<void> => {
		if (entry.startedObserved) return;
		entry.startedObserved = true;
		await emit(entry, {
			type: "started",
			chatSessionId,
			...(providerSessionId ? { providerSessionId } : {}),
		});
	};

	const settlePending = (entry: OwnedExecution, reason: string): void => {
		for (const [inputId, pending] of [...entry.pending]) {
			entry.pending.delete(inputId);
			if (pending.kind === "question") pending.reject(new Error(reason));
		}
	};

	const releaseOwned = (
		operationId: string,
		entry: OwnedExecution,
		reason: string,
	): void => {
		if (owned.get(operationId) !== entry) return;
		settlePending(entry, reason);
		entry.observe = undefined;
		owned.delete(operationId);
	};

	const finalize = async (
		operationId: string,
		outcome: ManagedOperationOutcome,
		reason?: string,
	): Promise<{ quiescent: boolean }> => {
		const entry = owned.get(operationId);
		if (!entry) {
			const current = getRuntime().operations.find(operationId);
			return {
				quiescent: current?.state === "ended" && current.quiescent === true,
			};
		}
		if (entry.finalizing) return entry.finalizing;

		const finalizing = (async (): Promise<{ quiescent: boolean }> => {
			let release = false;
			try {
				const stopped = await getRuntime().operations.stop(
					operationId,
					outcome,
				);
				if (stopped.state !== "ended" || !stopped.quiescent) {
					await emit(entry, {
						type: "unknown",
						reason:
							stopped.error ??
							"provider stop could not establish execution quiescence",
					});
					return { quiescent: false };
				}
				release = true;
				settlePending(entry, reason ?? "provider turn ended");
				await emit(entry, {
					type: "ended",
					outcome: stopped.outcome ?? outcome,
					quiescent: true,
					...(reason ? { reason } : {}),
				});
				return { quiescent: true };
			} catch (error) {
				if (!release) {
					const message =
						error instanceof Error ? error.message : String(error);
					getRuntime().operations.markUnknown(operationId, message);
					await emit(entry, { type: "unknown", reason: message });
				}
				return { quiescent: release };
			} finally {
				if (release) {
					releaseOwned(operationId, entry, reason ?? "provider turn ended");
				}
			}
		})();
		entry.finalizing = finalizing;
		try {
			return await finalizing;
		} finally {
			if (owned.get(operationId) === entry) entry.finalizing = undefined;
		}
	};

	const observeAdapterEvent = async (
		operationId: string,
		event: AdapterEvent,
	): Promise<void> => {
		const entry = owned.get(operationId);
		if (!entry) return;
		const current = getRuntime().operations.inspect(operationId);
		if (event.kind === "session") {
			if (event.session.harnessSessionId) {
				await notifyStarted(
					entry,
					current.sessionId,
					event.session.harnessSessionId,
				);
			}
			if (event.session.status === "dead") {
				await emit(entry, {
					type: "unknown",
					reason: "provider session ended without a confirmed transport stop",
				});
			}
			return;
		}
		if (event.kind === "item" && event.item.kind === "approval_request") {
			const approval = event.item as ApprovalRequest;
			if (approval.status !== "pending") return;
			const inputId = randomUUID();
			const providerRequestId = approval.id;
			const input = getRuntime().operations.recordInput({
				inputId,
				operationId,
				providerRequestId,
				kind: "permission",
				question: approval.title,
				...(approval.options
					? {
							options: approval.options.map((option) => ({
								id: option.optionId,
								label: option.label,
							})),
						}
					: {}),
			});
			entry.pending.set(inputId, {
				kind: "permission",
				operationId,
				providerRequestId,
				options: input.options,
			});
			await emit(entry, {
				type: "input",
				id: inputId,
				kind: "permission",
				question: input.question,
				...(input.options ? { options: input.options } : {}),
			});
			return;
		}
		if (event.kind !== "turn") return;
		if (event.turn.status === "running") {
			await notifyStarted(entry, current.sessionId, current.providerSessionId);
			return;
		}
		const outcome = event.turn.status;
		await emit(entry, {
			type: "ended",
			outcome,
			quiescent: false,
			...(event.turn.error ? { reason: event.turn.error.message } : {}),
		});
		queueMicrotask(() => {
			void finalize(operationId, outcome, event.turn.error?.message);
		});
	};

	const executionTools = (operationId: string): HarnessToolDefinition[] => [
		{
			name: "report_result",
			description:
				"Submit the final structured result for this bound execution. This tool cannot report for another execution.",
			inputSchema: reportResultSchema,
			requiresApproval: false,
			handler: async (rawInput) => {
				const input = reportResultSchema.parse(rawInput);
				const runtime = getRuntime();
				const current = runtime.operations.inspect(operationId);
				if (current.report !== undefined) {
					if (!reportEquals(current.report, input.report)) {
						throw new Error("a different result was already submitted");
					}
					return { accepted: true, duplicate: true };
				}
				const entry = owned.get(operationId);
				if (!entry) throw new Error("execution is no longer accepting reports");
				runtime.operations.recordReport(operationId, input.report);
				await emit(entry, { type: "report", report: input.report });
				return { accepted: true, duplicate: false };
			},
		},
		{
			name: "request_input",
			description:
				"Ask one explicit business question and wait for an answer bound to this execution.",
			inputSchema: requestInputSchema,
			requiresApproval: false,
			handler: async (rawInput, context) => {
				const entry = owned.get(operationId);
				if (!entry) throw new Error("execution is no longer accepting input");
				const input = requestInputSchema.parse(rawInput);
				const inputId = randomUUID();
				const persisted = getRuntime().operations.recordInput({
					inputId,
					operationId,
					providerRequestId: context.callId,
					kind: "question",
					question: input.question,
					...(input.options ? { options: input.options } : {}),
				});
				const answer = new Promise<string>((resolve, reject) => {
					entry.pending.set(inputId, {
						kind: "question",
						operationId,
						resolve,
						reject,
					});
				});
				await emit(entry, {
					type: "input",
					id: inputId,
					kind: "question",
					question: persisted.question,
					...(persisted.options ? { options: persisted.options } : {}),
				});
				return { answer: await answer };
			},
		},
	];

	const answerPermission = (
		pending: Extract<PendingInput, { kind: "permission" }>,
		answer: string,
	): void => {
		const normalized = answer.trim();
		if (/session|always|amendment/i.test(normalized)) {
			throw new Error(
				"session-wide permission is not valid for a bound execution input",
			);
		}
		if (normalized === "accept" || normalized === "allow") {
			getRuntime().operations.respondToApproval(
				pending.operationId,
				pending.providerRequestId,
				{ type: "accept" },
			);
			return;
		}
		if (normalized === "decline" || normalized === "deny") {
			getRuntime().operations.respondToApproval(
				pending.operationId,
				pending.providerRequestId,
				{ type: "decline" },
			);
			return;
		}
		if (normalized === "cancel") {
			getRuntime().operations.respondToApproval(
				pending.operationId,
				pending.providerRequestId,
				{ type: "cancel" },
			);
			return;
		}
		const option = pending.options?.find(
			(candidate) => candidate.id === normalized,
		);
		if (!option)
			throw new Error("answer does not match an available permission decision");
		getRuntime().operations.respondToApproval(
			pending.operationId,
			pending.providerRequestId,
			{ type: "option", optionId: option.id },
		);
	};

	const createHandle = (
		operationId: string,
		chatSessionId: string,
		providerSessionId?: string,
	): ExecutionDriverHandle => ({
		chatSessionId,
		...(providerSessionId ? { providerSessionId } : {}),
		cancel: async () => {
			const entry = owned.get(operationId);
			if (!entry) {
				const current = getRuntime().operations.find(operationId);
				return {
					quiescent: current?.state === "ended" && current.quiescent === true,
				};
			}
			try {
				await getRuntime().operations.cancelTurn(operationId);
			} catch {
				// A missing attachment remains unknown; stop below must not invent one.
			}
			return finalize(operationId, "interrupted", "cancellation requested");
		},
		answerInput: async (inputId, answer) => {
			const entry = owned.get(operationId);
			const pending = entry?.pending.get(inputId);
			if (!entry || !pending || pending.operationId !== operationId) {
				throw new Error(
					`input ${inputId} is not pending for operation ${operationId}`,
				);
			}
			getRuntime().operations.answerInput(inputId, answer);
			try {
				if (pending.kind === "permission") answerPermission(pending, answer);
				else pending.resolve(answer);
				getRuntime().operations.markInputDelivery(inputId, true);
			} catch (error) {
				getRuntime().operations.markInputDelivery(inputId, false);
				throw error;
			}
			entry.pending.delete(inputId);
		},
	});

	return {
		start: async (request, observe) => {
			const runtime = getRuntime();
			const requestHash = digest(request);
			const existingOwned = owned.get(request.operationId);
			if (existingOwned) {
				if (existingOwned.requestHash !== requestHash) {
					throw new Error(
						`operation ${request.operationId} was already started with different parameters`,
					);
				}
				const current = runtime.operations.inspect(request.operationId);
				return createHandle(
					request.operationId,
					current.sessionId,
					current.providerSessionId,
				);
			}

			let resume: { harnessSessionId: string } | undefined;
			if (request.definition.executor.sessionMode === "reuse") {
				const reuseId = request.definition.executor.sessionId;
				if (!reuseId)
					throw new Error("reuse requires a managed chat session id");
				const prior = runtime.operations.findBySession(reuseId);
				if (!prior || prior.harness !== request.definition.executor.harness) {
					throw new Error(
						"reuse session is not owned by a matching managed execution",
					);
				}
				if (
					!prior.quiescent ||
					prior.state !== "ended" ||
					prior.accountRef !== request.definition.executor.accountRef ||
					prior.targetKey !== executionTargetKey(request) ||
					!prior.providerSessionId ||
					runtime.operations.isProviderSessionOccupied(
						prior.providerSessionId,
						prior.operationId,
					)
				) {
					throw new Error(
						"reuse session identity is occupied or does not match account and target",
					);
				}
				resume = { harnessSessionId: prior.providerSessionId };
			}

			const entry: OwnedExecution = {
				requestHash,
				observe,
				pending: new Map(),
				startedObserved: false,
			};
			owned.set(request.operationId, entry);
			const operationId = request.operationId;
			try {
				const started = runtime.operations.start({
					operationId,
					parameterIdentity: {
						executionId: request.executionId,
						operationId,
						definition: request.definition,
						workspaceId: request.prepared.workspaceId,
						cwd: request.prepared.cwd,
						instructions: request.prepared.instructions,
						envHash: digest(request.prepared.env),
					},
					scopeId: request.prepared.workspaceId,
					harness: request.definition.executor.harness,
					accountRef: request.definition.executor.accountRef,
					targetKey: executionTargetKey(request),
					cwd: request.prepared.cwd,
					modelId: request.definition.executor.model,
					resume,
					env: request.prepared.env,
					tools: executionTools(operationId),
					prompt: [{ type: "text", text: request.prepared.instructions }],
					observer: {
						onEvent: (event) => observeAdapterEvent(operationId, event),
					},
				});
				if (started.recovered && !started.live && started.state !== "ended") {
					await emit(entry, {
						type: "unknown",
						reason:
							started.error ?? "provider operation cannot be safely reattached",
					});
				}
				if (!started.recovered && started.providerSessionId) {
					await notifyStarted(
						entry,
						started.sessionId,
						started.providerSessionId,
					);
				}
				if (started.state === "ended" && started.quiescent) {
					releaseOwned(operationId, entry, "provider turn ended");
				}
				return createHandle(
					request.operationId,
					started.sessionId,
					started.providerSessionId,
				);
			} catch (error) {
				const current = runtime.operations.find(request.operationId);
				if (!current || (current.state === "ended" && current.quiescent)) {
					releaseOwned(operationId, entry, "provider start failed");
				}
				throw error;
			}
		},

		inspect: async (input): Promise<ExecutionInspection> => {
			const runtime = getRuntime();
			const current = runtime.operations.find(input.operationId);
			if (!current) return { state: "unknown" };
			if (current.state === "unknown") return { state: "unknown" };
			if (current.state !== "ended") {
				return runtime.operations.isLive(current.sessionId)
					? {
							state: "running",
							...(current.report
								? { report: executionReportSchema.parse(current.report) }
								: {}),
						}
					: { state: "unknown" };
			}
			if (!current.outcome) return { state: "unknown" };
			return {
				state: "ended",
				outcome: current.outcome,
				quiescent: current.quiescent,
				...(current.report
					? { report: executionReportSchema.parse(current.report) }
					: {}),
			};
		},

		dispose: async () => {
			for (const [operationId, entry] of [...owned]) {
				const current = getRuntime().operations.find(operationId);
				if (!current || (current.state === "ended" && current.quiescent)) {
					releaseOwned(operationId, entry, "driver disposed");
					continue;
				}
				await finalize(
					operationId,
					current.outcome ?? "interrupted",
					"driver disposed",
				);
			}
			for (const [operationId, entry] of [...owned]) {
				releaseOwned(operationId, entry, "driver disposed");
			}
		},
	};
}
