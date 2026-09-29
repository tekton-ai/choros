import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatRuntime } from "@choros/chat-runtime";
import {
	createBunChatDb,
	createManagedExecutionFixtureRuntime,
} from "@choros/chat-runtime/testing";
import type { AutomationDefinition } from "@choros/shared/automation-contracts";
import { createNativeExecutionDriver } from "./native-driver";
import type {
	ExecutionDriver,
	ExecutionDriverEvent,
	ExecutionDriverHandle,
	ExecutionDriverRequest,
} from "./types";

type OperationIdentity = {
	executionId: string;
	operationId: string;
	workspaceId: string;
};

type StartedFixture = {
	events: ExecutionDriverEvent[];
	handle: ExecutionDriverHandle;
	envRef: WeakRef<object>;
	observerRef: WeakRef<object>;
};

const resources: Array<{
	directory: string;
	driver: ExecutionDriver;
	runtime: ChatRuntime;
}> = [];

function definition(
	workspaceId: string,
	sessionMode: "fresh" | "reuse" = "fresh",
): AutomationDefinition {
	return {
		name: "Native driver fixture",
		instructions: "Use the controlled protocol fixture and report its answer.",
		target: {
			kind: "existingWorkspace",
			workspaceId,
			setupPolicy: "prepared",
		},
		executor: {
			harness: "codex",
			accountRef: "codex-home:/tmp/native-driver-fixture",
			sessionMode,
		},
		schedule: { kind: "immediate" },
		stop: {},
		missedRunWindowSeconds: 3_600,
		setupTimeoutSeconds: 600,
	};
}

function identity(): OperationIdentity {
	return {
		executionId: randomUUID(),
		operationId: randomUUID(),
		workspaceId: randomUUID(),
	};
}

function request(
	operation: OperationIdentity,
	env: Record<string, string>,
	overrideDefinition = definition(operation.workspaceId),
): ExecutionDriverRequest {
	return {
		...operation,
		definition: overrideDefinition,
		prepared: {
			workspaceId: operation.workspaceId,
			cwd: `/tmp/${operation.workspaceId}`,
			env,
			instructions: overrideDefinition.instructions,
		},
	};
}

function runtimeFixture(options?: { report?: (answer: string) => unknown }): {
	driver: ExecutionDriver;
	runtime: ChatRuntime;
} {
	const directory = mkdtempSync(join(tmpdir(), "native-driver-"));
	const runtime = createManagedExecutionFixtureRuntime({
		dataDir: directory,
		openDatabase: createBunChatDb,
		report:
			options?.report ??
			((answer) => ({
				outcome: "completed",
				summary: `Controlled fixture answered: ${answer}`,
				artifacts: [],
				verification: {
					status: "not_run",
					reason: "Deterministic protocol fixture only",
				},
			})),
	});
	const driver = createNativeExecutionDriver({ runtime });
	resources.push({ directory, driver, runtime });
	return { driver, runtime };
}

async function waitForEvent(
	events: ExecutionDriverEvent[],
	predicate: (event: ExecutionDriverEvent) => boolean,
): Promise<ExecutionDriverEvent> {
	for (let attempt = 0; attempt < 200; attempt += 1) {
		const event = events.find(predicate);
		if (event) return event;
		await Bun.sleep(5);
	}
	throw new Error("timed out waiting for native driver event");
}

function inputEvent(
	events: ExecutionDriverEvent[],
): Extract<ExecutionDriverEvent, { type: "input" }> {
	const event = events.find(
		(
			candidate,
		): candidate is Extract<ExecutionDriverEvent, { type: "input" }> =>
			candidate.type === "input",
	);
	if (!event) throw new Error("fixture did not request input");
	return event;
}

async function forceCollection(refs: WeakRef<object>[]): Promise<void> {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		Bun.gc(true);
		await Bun.sleep(10);
		if (refs.every((ref) => ref.deref() === undefined)) return;
		await Bun.sleep(0);
	}
	expect(refs.filter((ref) => ref.deref() !== undefined)).toEqual([]);
}

async function startFixture(
	driver: ExecutionDriver,
	operation: OperationIdentity,
	secret: string,
	overrideDefinition?: AutomationDefinition,
): Promise<StartedFixture> {
	const env = { PROVIDER_SECRET: secret };
	const observerState = { calls: 0 };
	const events: ExecutionDriverEvent[] = [];
	const envRef = new WeakRef<object>(env);
	const observerRef = new WeakRef<object>(observerState);
	const handle = await driver.start(
		request(operation, env, overrideDefinition),
		async (event) => {
			observerState.calls += 1;
			events.push(event);
		},
	);
	return { events, handle, envRef, observerRef };
}

async function completeFixture(started: StartedFixture): Promise<void> {
	await waitForEvent(started.events, (event) => event.type === "input");
	await started.handle.answerInput(inputEvent(started.events).id, "continue");
	await waitForEvent(
		started.events,
		(event) => event.type === "ended" && event.quiescent,
	);
}

afterEach(async () => {
	for (const resource of resources.splice(0)) {
		await resource.driver.dispose();
		await resource.runtime.dispose();
		rmSync(resource.directory, { recursive: true, force: true });
	}
});

async function rejectedReuseRefs(
	driver: ExecutionDriver,
	operation: OperationIdentity,
): Promise<WeakRef<object>[]> {
	const env = { PROVIDER_SECRET: "invalid-reuse-secret" };
	const observerState = { calls: 0 };
	const envRef = new WeakRef<object>(env);
	const observerRef = new WeakRef<object>(observerState);
	await expect(
		driver.start(
			request(operation, env, definition(operation.workspaceId, "reuse")),
			async () => {
				observerState.calls += 1;
			},
		),
	).rejects.toThrow("reuse requires a managed chat session id");
	expect(observerState.calls).toBe(0);
	return [envRef, observerRef];
}

describe("createNativeExecutionDriver ownership", () => {
	test("releases terminal runs and their env and observer closures across many rounds", async () => {
		const { driver, runtime } = runtimeFixture();
		const refs: WeakRef<object>[] = [];

		for (let round = 0; round < 12; round += 1) {
			const operation = identity();
			const started = await startFixture(driver, operation, `round-${round}`);
			await completeFixture(started);
			refs.push(started.envRef, started.observerRef);

			expect(runtime.live.get(started.handle.chatSessionId)).toBeNull();
			expect(
				await driver.inspect({
					executionId: operation.executionId,
					operationId: operation.operationId,
				}),
			).toMatchObject({
				state: "ended",
				outcome: "completed",
				quiescent: true,
			});
		}

		await forceCollection(refs);
	});

	test("keeps active and unknown ownership controllable without redispatch", async () => {
		const { driver, runtime } = runtimeFixture();
		const operation = identity();
		const env = { PROVIDER_SECRET: "active-secret" };
		const events: ExecutionDriverEvent[] = [];
		const operationRequest = request(operation, env);
		const first = await driver.start(operationRequest, async (event) => {
			events.push(event);
		});
		await waitForEvent(events, (event) => event.type === "input");

		runtime.operations.markUnknown(
			operation.operationId,
			"fixture uncertainty",
		);
		const repeated = await driver.start(operationRequest, async () => {
			throw new Error("a repeated start must not replace the active observer");
		});
		expect(repeated.chatSessionId).toBe(first.chatSessionId);
		expect(events.filter((event) => event.type === "input")).toHaveLength(1);

		await repeated.answerInput(inputEvent(events).id, "continue");
		await waitForEvent(
			events,
			(event) => event.type === "ended" && event.quiescent,
		);
		expect(runtime.live.get(first.chatSessionId)).toBeNull();
	});

	test("cancellation and provider failure both dispose the live resource and release secrets", async () => {
		const canceledRuntime = runtimeFixture();
		const canceled = await startFixture(
			canceledRuntime.driver,
			identity(),
			"cancel-secret",
		);
		await waitForEvent(canceled.events, (event) => event.type === "input");
		expect(await canceled.handle.cancel()).toEqual({ quiescent: true });
		expect(
			canceled.events.some(
				(event) =>
					event.type === "ended" &&
					event.outcome === "interrupted" &&
					event.quiescent,
			),
		).toBe(true);
		expect(
			canceledRuntime.runtime.live.get(canceled.handle.chatSessionId),
		).toBeNull();

		const failedRuntime = runtimeFixture({
			report: () => {
				throw new Error("fixture report generation failed");
			},
		});
		const failed = await startFixture(
			failedRuntime.driver,
			identity(),
			"failure-secret",
		);
		await completeFixture(failed);
		expect(
			failed.events.some(
				(event) =>
					event.type === "ended" &&
					event.outcome === "failed" &&
					event.quiescent,
			),
		).toBe(true);
		expect(
			failedRuntime.runtime.live.get(failed.handle.chatSessionId),
		).toBeNull();

		await forceCollection([
			canceled.envRef,
			canceled.observerRef,
			failed.envRef,
			failed.observerRef,
		]);
	});

	test("a recovered completed operation stays idempotent without retaining new inputs", async () => {
		const { driver: firstDriver, runtime } = runtimeFixture();
		const operation = identity();
		const first = await startFixture(firstDriver, operation, "stable-secret");
		await completeFixture(first);

		const recoveredDriver = createNativeExecutionDriver({ runtime });
		const recovered = await startFixture(
			recoveredDriver,
			operation,
			"stable-secret",
		);
		expect(recovered.handle.chatSessionId).toBe(first.handle.chatSessionId);
		expect(recovered.events).toEqual([]);
		expect(runtime.live.get(first.handle.chatSessionId)).toBeNull();

		const repeated = await startFixture(
			recoveredDriver,
			operation,
			"stable-secret",
		);
		expect(repeated.handle.chatSessionId).toBe(first.handle.chatSessionId);
		expect(repeated.events).toEqual([]);
		expect(
			await recoveredDriver.inspect({
				...operation,
				chatSessionId: repeated.handle.chatSessionId,
			}),
		).toMatchObject({ state: "ended", outcome: "completed", quiescent: true });

		await forceCollection([
			recovered.envRef,
			recovered.observerRef,
			repeated.envRef,
			repeated.observerRef,
		]);
		await recoveredDriver.dispose();
	});

	test("reuse validation failures do not retain prepared env or observer callbacks", async () => {
		const { driver } = runtimeFixture();
		const refs = await rejectedReuseRefs(driver, identity());
		await forceCollection(refs);
	});
});
