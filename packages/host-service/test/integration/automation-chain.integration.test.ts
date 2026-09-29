import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createBunChatDb,
	createManagedExecutionFixtureRuntime,
} from "@choros/chat-runtime/testing";
import type {
	AutomationDefinitionInput,
	AutomationRun,
} from "@choros/shared/automation-contracts";
import { createNativeExecutionDriver } from "../../src/runtime/executions/native-driver";
import { createTestHost, type TestHost } from "../helpers/create-test-host";
import { createGitFixture } from "../helpers/git-fixture";
import { seedProject, seedWorkspace } from "../helpers/seed";

const disposals: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const dispose of disposals.splice(0).reverse()) await dispose();
});

async function fixture(now?: () => number) {
	const root = mkdtempSync(join(tmpdir(), "automation-chain-"));
	const accountDir = join(root, "account");
	const repo = await createGitFixture();
	mkdirSync(accountDir);
	const chat = createManagedExecutionFixtureRuntime({
		dataDir: join(root, "chat"),
		openDatabase: createBunChatDb,
		question: "Choose the report label",
		report: (answer) => ({
			outcome: "completed",
			summary: `Checked fixture: ${answer}`,
			artifacts: [],
			verification: {
				status: "not_run",
				reason: "This protocol fixture does not claim model verification.",
			},
		}),
	});
	const host = await createTestHost({
		automation: {
			driver: createNativeExecutionDriver({ runtime: chat }),
			autoStart: false,
			now,
		},
	});
	disposals.push(async () => {
		await host.dispose();
		await chat.dispose();
		repo.dispose();
		rmSync(root, { recursive: true, force: true });
	});
	const project = seedProject(host, { repoPath: repo.repoPath });
	const workspace = seedWorkspace(host, {
		projectId: project.id,
		worktreePath: repo.repoPath,
		branch: "main",
		type: "main",
	});
	const definition: AutomationDefinitionInput = {
		name: "Protocol fixture task",
		instructions: "Ask for a label and report the result; do not edit files.",
		target: {
			kind: "existingWorkspace",
			workspaceId: workspace.id,
			setupPolicy: "prepared",
		},
		executor: {
			harness: "claude-code",
			accountRef: `claude-config:${accountDir}`,
			sessionMode: "fresh",
		},
		schedule: { kind: "immediate" },
		precheck: { command: "printf precheck-ok", timeoutSeconds: 2 },
	};
	return { host, definition, chat };
}

async function waitRun(
	host: TestHost,
	id: string,
	predicate: (run: AutomationRun) => boolean,
): Promise<AutomationRun> {
	const until = performance.now() + 5000;
	while (performance.now() < until) {
		const run = await host.trpc.automations.getRun.query({ id });
		if (predicate(run)) return run;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error(`Run ${id} did not reach the expected state`);
}

async function begin(host: TestHost, definition: AutomationDefinitionInput) {
	const preview = await host.trpc.automations.preview.query({
		definition,
		intent: "run",
	});
	return host.trpc.automations.create.mutate({
		requestId: crypto.randomUUID(),
		confirmationToken: preview.confirmationToken,
		runImmediately: true,
	});
}

describe("Automation through real Host, SQLite and managed chat with only provider protocol mocked", () => {
	test("persists preparation, waits for an answer and delivers one result across the API", async () => {
		const { host, definition } = await fixture();
		await expect(
			host.unauthenticatedTrpc.automations.preview.query({
				definition,
				intent: "save",
			}),
		).rejects.toThrow();
		const created = await begin(host, definition);
		expect(created.automation.state).toBe("paused");
		const waiting = await waitRun(
			host,
			created.run!.id,
			(run) => run.status === "waiting",
		);
		expect(
			waiting.preparation?.find((entry) => entry.stage.startsWith("precheck"))
				?.output,
		).toBe("precheck-ok");
		const question = waiting.inputs.find(
			(input) => input.status === "pending",
		)!;
		const request = {
			requestId: crypto.randomUUID(),
			inputId: question.id,
			expectedVersion: question.version,
			answer: "green",
		};
		await host.trpc.executions.answerInput.mutate(request);
		const completed = await waitRun(
			host,
			waiting.id,
			(run) => run.status === "succeeded",
		);
		expect(completed.report?.summary).toBe("Checked fixture: green");
		expect(completed.report?.verification.status).toBe("not_run");
		expect(completed.inputs[0]?.status).toBe("answered");
		await host.trpc.executions.answerInput.mutate(request);
		expect(
			(await host.trpc.automations.getRun.query({ id: completed.id })).status,
		).toBe("succeeded");
		expect(
			(
				await host.trpc.automations.listRuns.query({
					automationId: created.automation.id,
				})
			).items.map((run) => run.id),
		).toEqual([completed.id]);
	}, 15000);

	test("a nonzero precheck produces a skip and never starts a provider session", async () => {
		const { host, definition } = await fixture();
		const created = await begin(host, {
			...definition,
			precheck: { command: "printf unavailable; exit 7", timeoutSeconds: 2 },
		});
		const skipped = await waitRun(
			host,
			created.run!.id,
			(run) => run.status === "skipped",
		);
		expect(skipped.chatSessionId).toBeUndefined();
		expect(skipped.reason).toBe("precheck_false");
		expect(skipped.report).toBeUndefined();
		expect(
			skipped.preparation?.find((entry) => entry.stage.startsWith("precheck"))
				?.exitCode,
		).toBe(7);
		expect(skipped.inputs).toEqual([]);
	}, 15000);

	test("cancels a waiting provider turn without allowing an old answer to resurrect it", async () => {
		const { host, definition } = await fixture();
		const created = await begin(host, definition);
		const waiting = await waitRun(
			host,
			created.run!.id,
			(run) => run.status === "waiting",
		);
		const question = waiting.inputs[0]!;
		await host.trpc.executions.requestCancel.mutate({
			requestId: crypto.randomUUID(),
			runId: waiting.id,
		});
		const cancelled = await waitRun(
			host,
			waiting.id,
			(run) => run.status === "cancelled",
		);
		await expect(
			host.trpc.executions.answerInput.mutate({
				requestId: crypto.randomUUID(),
				inputId: question.id,
				expectedVersion: question.version,
				answer: "late",
			}),
		).rejects.toThrow();
		expect(
			(await host.trpc.automations.getRun.query({ id: cancelled.id })).status,
		).toBe("cancelled");
		expect(cancelled.report).toBeUndefined();
	}, 15000);

	test("a real scheduler tick respects pause, overlap and finite round accounting", async () => {
		let now = Date.parse("2026-10-01T00:00:00Z");
		const { host, definition } = await fixture(() => now);
		const scheduled: AutomationDefinitionInput = {
			...definition,
			schedule: {
				kind: "fixedInterval",
				startsAt: new Date(now + 60000).toISOString(),
				intervalSeconds: 60,
				timeZone: "UTC",
			},
			stop: { maxRounds: 2 },
		};
		const preview = await host.trpc.automations.preview.query({
			definition: scheduled,
			intent: "save",
		});
		const created = await host.trpc.automations.create.mutate({
			requestId: crypto.randomUUID(),
			confirmationToken: preview.confirmationToken,
		});
		await host.automations.tick();
		expect(
			(
				await host.trpc.automations.listRuns.query({
					automationId: created.automation.id,
				})
			).items,
		).toEqual([]);
		const activation = await host.trpc.automations.preview.query({
			definition: created.automation.definition,
			automationId: created.automation.id,
			expectedVersion: created.automation.version,
			intent: "enable",
		});
		await host.trpc.automations.setScheduleState.mutate({
			id: created.automation.id,
			expectedVersion: created.automation.version,
			requestId: crypto.randomUUID(),
			state: "enabled",
			confirmationToken: activation.confirmationToken,
		});
		now += 60000;
		await host.automations.tick();
		const firstPage = await host.trpc.automations.listRuns.query({
			automationId: created.automation.id,
		});
		const first = await waitRun(
			host,
			firstPage.items[0]!.id,
			(run) => run.status === "waiting",
		);
		now += 60000;
		await host.automations.tick();
		const blocked = await host.trpc.automations.listRuns.query({
			automationId: created.automation.id,
			status: "skipped",
		});
		expect(blocked.items.map((run) => run.reason)).toEqual(["overlap"]);
		const finishedSchedule = await host.trpc.automations.get.query({
			id: created.automation.id,
		});
		expect(finishedSchedule.usedRounds).toBe(2);
		expect(finishedSchedule.nextRunAt).toBeNull();
		await host.trpc.executions.answerInput.mutate({
			requestId: crypto.randomUUID(),
			inputId: first.inputs[0]!.id,
			expectedVersion: first.inputs[0]!.version,
			answer: "scheduled",
		});
		await waitRun(host, first.id, (run) => run.status === "succeeded");
		const extra = await host.trpc.automations.runNow.mutate({
			id: created.automation.id,
			requestId: crypto.randomUUID(),
		});
		const extraWaiting = await waitRun(
			host,
			extra.id,
			(run) => run.status === "waiting",
		);
		expect(extraWaiting.source).toBe("manual");
		expect(
			(await host.trpc.automations.get.query({ id: created.automation.id }))
				.usedRounds,
		).toBe(2);
		await host.trpc.executions.requestCancel.mutate({
			runId: extra.id,
			requestId: crypto.randomUUID(),
		});
		await waitRun(host, extra.id, (run) => run.status === "cancelled");
	}, 15000);
});
