import { Database as BunDatabase } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AutomationDefinition } from "@choros/shared/automation-contracts";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import {
	automationRuns,
	automations,
	automationVersions,
	executionOperations,
	executionRuns,
	type HostDb,
} from "../../db";
import * as schema from "../../db/schema";
import type {
	ExecutionDriver,
	ExecutionDriverEvent,
	ExecutionDriverHandle,
} from "../executions/types";
import { ExecutionPreparationError } from "../executions/types";
import {
	type AutomationRuntime,
	AutomationRuntimeError,
	createAutomationRuntime,
} from "./automation-runtime";

const migrationsFolder = join(import.meta.dir, "../../../drizzle");
const createdDirectories: string[] = [];

function createDatabase(): HostDb {
	const directory = mkdtempSync(join(tmpdir(), "choros-automation-runtime-"));
	createdDirectories.push(directory);
	const sqlite = new BunDatabase(join(directory, "host.sqlite"), {
		create: true,
		readwrite: true,
	});
	sqlite.exec("PRAGMA journal_mode = WAL");
	sqlite.exec("PRAGMA foreign_keys = ON");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder });
	return db as unknown as HostDb;
}

function definition(): AutomationDefinition {
	return {
		name: "Inspect fixture",
		instructions: "Inspect the isolated fixture and report the result.",
		target: {
			kind: "existingWorkspace",
			workspaceId: "00000000-0000-4000-8000-000000000001",
			setupPolicy: "prepared",
		},
		executor: {
			harness: "codex",
			accountRef: "codex-home:/tmp/fixture-account",
			sessionMode: "fresh",
		},
		schedule: { kind: "immediate" },
		stop: {},
		missedRunWindowSeconds: 3_600,
		setupTimeoutSeconds: 600,
	};
}

async function waitFor(predicate: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (predicate()) return;
		await Bun.sleep(5);
	}
	throw new Error("Timed out waiting for automation state");
}

class CompletingDriver implements ExecutionDriver {
	starts = 0;
	seenSecret: string | undefined;

	async start(
		request: Parameters<ExecutionDriver["start"]>[0],
		observe: (event: ExecutionDriverEvent) => Promise<void>,
	): Promise<ExecutionDriverHandle> {
		this.starts += 1;
		this.seenSecret = request.prepared.env.PROVIDER_SECRET;
		await observe({
			type: "started",
			chatSessionId: "chat-fixture",
			providerSessionId: "provider-fixture",
		});
		await observe({
			type: "report",
			report: {
				outcome: "completed",
				summary: "Fixture inspected.",
				artifacts: [],
				verification: { status: "not_run", reason: "Protocol fixture only" },
			},
		});
		await observe({ type: "ended", outcome: "completed", quiescent: true });
		return {
			chatSessionId: "chat-fixture",
			providerSessionId: "provider-fixture",
			cancel: async () => ({ quiescent: true }),
			answerInput: async () => undefined,
		};
	}

	async inspect() {
		return {
			state: "ended" as const,
			quiescent: true,
			outcome: "completed" as const,
		};
	}

	async dispose() {}
}

class HoldingDriver implements ExecutionDriver {
	async start(): Promise<ExecutionDriverHandle> {
		return {
			chatSessionId: "chat-holding",
			cancel: async () => ({ quiescent: false }),
			answerInput: async () => undefined,
		};
	}

	async inspect() {
		return { state: "running" as const };
	}

	async dispose() {}
}

class ScheduledDriver implements ExecutionDriver {
	observe?: (event: ExecutionDriverEvent) => Promise<void>;

	async start(
		_request: Parameters<ExecutionDriver["start"]>[0],
		observe: (event: ExecutionDriverEvent) => Promise<void>,
	): Promise<ExecutionDriverHandle> {
		this.observe = observe;
		await observe({ type: "started", chatSessionId: "chat-scheduled" });
		return {
			chatSessionId: "chat-scheduled",
			cancel: async () => ({ quiescent: true }),
			answerInput: async () => undefined,
		};
	}

	async inspect() {
		return { state: "running" as const };
	}

	async dispose() {}
}

class InteractiveDriver implements ExecutionDriver {
	observe?: (event: ExecutionDriverEvent) => Promise<void>;
	answerStarted = false;
	private releaseAnswer?: () => void;

	async start(
		_request: Parameters<ExecutionDriver["start"]>[0],
		observe: (event: ExecutionDriverEvent) => Promise<void>,
	): Promise<ExecutionDriverHandle> {
		this.observe = observe;
		await observe({ type: "started", chatSessionId: "chat-interactive" });
		await observe({
			type: "input",
			id: "00000000-0000-4000-8000-000000000099",
			kind: "question",
			question: "Continue?",
		});
		return {
			chatSessionId: "chat-interactive",
			cancel: async () => ({ quiescent: true }),
			answerInput: async () => {
				this.answerStarted = true;
				await new Promise<void>((resolve) => {
					this.releaseAnswer = resolve;
				});
			},
		};
	}

	completeAnswer(): void {
		this.releaseAnswer?.();
	}

	async inspect() {
		return { state: "running" as const };
	}

	async dispose() {}
}

function runtimeWith(driver: ExecutionDriver): {
	runtime: AutomationRuntime;
	db: ReturnType<typeof createDatabase>;
} {
	const db = createDatabase();
	return {
		db,
		runtime: createAutomationRuntime({
			db,
			driver,
			resolveDefinition: async (value) => value,
			prepareExecution: async ({ workspaceId, onStage }) => {
				await onStage("setup", workspaceId, {
					stage: "setup",
					exitCode: 0,
					output: "setup complete",
					truncated: false,
					quiescent: true,
				});
				return {
					workspaceId,
					cwd: "/tmp/fixture-workspace",
					env: { PROVIDER_SECRET: "must-not-be-persisted" },
					instructions: definition().instructions,
				};
			},
		}),
	};
}

afterEach(() => {
	for (const directory of createdDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("automation runtime persistence", () => {
	test("previews only remaining finite rounds, including after prior rounds were consumed", async () => {
		const { runtime, db } = runtimeWith(new HoldingDriver());
		const startsAt = Date.now() + 60_000;
		const finite: AutomationDefinition = {
			...definition(),
			schedule: {
				kind: "fixedInterval",
				startsAt: new Date(startsAt).toISOString(),
				intervalSeconds: 60,
				timeZone: "UTC",
			},
			stop: { maxRounds: 3 },
		};
		try {
			const preview = await runtime.preview({
				definition: finite,
				intent: "save",
			});
			expect(preview.nextOccurrences.map((slot) => slot.at)).toEqual(
				[0, 1, 2].map((round) =>
					new Date(startsAt + round * 60_000).toISOString(),
				),
			);
			const { automation } = await runtime.create({
				requestId: "save-finite-preview",
				confirmationToken: preview.confirmationToken,
			});
			db.update(automations)
				.set({ usedRounds: 1 })
				.where(eq(automations.id, automation.id))
				.run();
			const remaining = await runtime.preview({
				definition: finite,
				automationId: automation.id,
				expectedVersion: automation.version,
				intent: "enable",
			});
			expect(remaining.nextOccurrences.map((slot) => slot.at)).toEqual(
				[0, 1].map((round) =>
					new Date(startsAt + round * 60_000).toISOString(),
				),
			);
			db.update(automations)
				.set({ usedRounds: 3 })
				.where(eq(automations.id, automation.id))
				.run();
			expect(
				(
					await runtime.preview({
						definition: finite,
						automationId: automation.id,
						expectedVersion: automation.version,
						intent: "enable",
					})
				).nextOccurrences,
			).toEqual([]);
		} finally {
			await runtime.stop();
			db.$client.close();
		}
	});

	test("returns the original receipt and persists evidence without prepared environment secrets", async () => {
		const driver = new CompletingDriver();
		const { runtime, db } = runtimeWith(driver);
		const preview = await runtime.preview({
			definition: definition(),
			intent: "run",
		});
		const first = await runtime.create({
			requestId: "create-fixture",
			confirmationToken: preview.confirmationToken,
			runImmediately: true,
		});
		const repeated = await runtime.create({
			requestId: "create-fixture",
			confirmationToken: preview.confirmationToken,
			runImmediately: true,
		});

		expect(repeated.automation.id).toBe(first.automation.id);
		expect(repeated.run?.id).toBe(first.run?.id);
		await waitFor(
			() => runtime.getRun({ id: first.run!.id }).status === "succeeded",
		);
		const run = runtime.getRun({ id: first.run!.id });
		expect(run.preparation).toEqual([
			{
				stage: "setup",
				exitCode: 0,
				output: "setup complete",
				truncated: false,
				quiescent: true,
			},
		]);
		expect(driver.starts).toBe(1);
		expect(driver.seenSecret).toBe("must-not-be-persisted");
		for (const operation of db.select().from(executionOperations).all()) {
			expect(operation.receipt ?? "").not.toContain("must-not-be-persisted");
			expect(operation.receipt ?? "").not.toContain("PROVIDER_SECRET");
		}
		await runtime.stop();
		db.$client.close();
	});

	test("rejects a busy manual run without creating another run", async () => {
		const { runtime, db } = runtimeWith(new HoldingDriver());
		const preview = await runtime.preview({
			definition: definition(),
			intent: "save",
		});
		const created = await runtime.create({
			requestId: "save-fixture",
			confirmationToken: preview.confirmationToken,
			runImmediately: false,
		});
		await runtime.runNow({ requestId: "run-one", id: created.automation.id });
		let error: unknown;
		try {
			await runtime.runNow({ requestId: "run-two", id: created.automation.id });
		} catch (caught) {
			error = caught;
		}
		expect(error).toBeInstanceOf(AutomationRuntimeError);
		expect((error as AutomationRuntimeError).code).toBe("RUN_BUSY");
		expect(
			runtime.listRuns({ automationId: created.automation.id }).items,
		).toHaveLength(1);
		await runtime.stop();
		db.$client.close();
	});

	test("does not reconcile its own preparation and only releases a cancelled preparation on quiescent evidence", async () => {
		const db = createDatabase();
		let preparationEntered = false;
		const runtime = createAutomationRuntime({
			db,
			driver: new HoldingDriver(),
			resolveDefinition: async (value) => value,
			prepareExecution: async ({ workspaceId, signal, onStage }) => {
				preparationEntered = true;
				return await new Promise<never>((_resolve, reject) => {
					signal.addEventListener("abort", () => {
						void onStage("setup", workspaceId, {
							stage: "setup",
							exitCode: null,
							output: "process group stopped",
							truncated: false,
							quiescent: true,
						}).then(() =>
							reject(
								new ExecutionPreparationError(
									"cancelled",
									"setup",
									"unknown",
									true,
								),
							),
						);
					});
				});
			},
		});
		const preview = await runtime.preview({
			definition: definition(),
			intent: "run",
		});
		const created = await runtime.create({
			requestId: "prepare-run",
			confirmationToken: preview.confirmationToken,
			runImmediately: true,
		});
		await waitFor(() => preparationEntered);
		await runtime.tick();
		expect(runtime.getRun({ id: created.run!.id }).status).toBe("preparing");
		await runtime.requestCancel({
			requestId: "cancel-prepare",
			runId: created.run!.id,
		});
		await waitFor(
			() => runtime.getRun({ id: created.run!.id }).status === "cancelled",
		);
		const cancelled = runtime.getRun({ id: created.run!.id });
		expect(cancelled.preparation?.[0]?.output).toBe("process group stopped");
		await runtime.stop();
		db.$client.close();
	});

	test("never resurrects a terminal run after an input answer completes", async () => {
		const driver = new InteractiveDriver();
		const { runtime, db } = runtimeWith(driver);
		const preview = await runtime.preview({
			definition: definition(),
			intent: "run",
		});
		const created = await runtime.create({
			requestId: "interactive-run",
			confirmationToken: preview.confirmationToken,
			runImmediately: true,
		});
		await waitFor(
			() => runtime.getRun({ id: created.run!.id }).status === "waiting",
		);
		const answer = runtime.answerInput({
			requestId: "answer-interactive",
			inputId: "00000000-0000-4000-8000-000000000099",
			expectedVersion: 1,
			answer: "yes",
		});
		await waitFor(() => driver.answerStarted);
		await runtime.requestCancel({
			requestId: "cancel-interactive",
			runId: created.run!.id,
		});
		driver.completeAnswer();
		await answer;
		expect(runtime.getRun({ id: created.run!.id }).status).toBe("cancelled");
		await runtime.stop();
		db.$client.close();
	});

	test("does not accept a late successful report while an input remains unresolved", async () => {
		const driver = new InteractiveDriver();
		const { runtime, db } = runtimeWith(driver);
		const preview = await runtime.preview({
			definition: definition(),
			intent: "run",
		});
		const created = await runtime.create({
			requestId: "late-report-run",
			confirmationToken: preview.confirmationToken,
			runImmediately: true,
		});
		await waitFor(
			() => runtime.getRun({ id: created.run!.id }).status === "waiting",
		);
		await driver.observe?.({
			type: "ended",
			outcome: "completed",
			quiescent: true,
		});
		expect(runtime.getRun({ id: created.run!.id }).status).toBe("needs_result");
		await driver.observe?.({
			type: "report",
			report: {
				outcome: "completed",
				summary: "Late result",
				artifacts: [],
				verification: { status: "not_run", reason: "fixture" },
			},
		});
		expect(runtime.getRun({ id: created.run!.id }).status).toBe("needs_result");
		await runtime.stop();
		db.$client.close();
	});

	test("allows only one SQLite claimant for an external operation", () => {
		const db = createDatabase();
		const timestamp = 1_000;
		db.insert(automations)
			.values({
				id: "automation-cas",
				currentRevision: 1,
				version: 1,
				state: "paused",
				usedRounds: 0,
				createdAt: timestamp,
				updatedAt: timestamp,
			})
			.run();
		db.insert(automationVersions)
			.values({
				automationId: "automation-cas",
				revision: 1,
				definition: JSON.stringify(definition()),
				createdAt: timestamp,
			})
			.run();
		db.insert(automationRuns)
			.values({
				id: "run-cas",
				automationId: "automation-cas",
				definitionRevision: 1,
				source: "manual",
				status: "preparing",
				executionId: "execution-cas",
				createdAt: timestamp,
			})
			.run();
		db.insert(executionRuns)
			.values({
				id: "execution-cas",
				runId: "run-cas",
				automationId: "automation-cas",
				definitionRevision: 1,
				status: "preparing",
				stage: "accepted",
				automationOccupancy: "automation-cas",
				createdAt: timestamp,
			})
			.run();
		db.insert(executionOperations)
			.values({
				id: "operation-cas",
				executionId: "execution-cas",
				kind: "prepare",
				state: "pending",
				parameterDigest: "digest",
				createdAt: timestamp,
				updatedAt: timestamp,
			})
			.run();

		const claim = () =>
			db
				.update(executionOperations)
				.set({ state: "dispatching" })
				.where(
					and(
						eq(executionOperations.id, "operation-cas"),
						eq(executionOperations.state, "pending"),
					),
				)
				.run().changes;
		expect(claim()).toBe(1);
		expect(claim()).toBe(0);
		db.$client.close();
	});

	test("persists the after-completion anchor used to enable a schedule", async () => {
		const db = createDatabase();
		let clock = Date.parse("2026-09-28T09:00:00Z");
		const runtime = createAutomationRuntime({
			db,
			driver: new HoldingDriver(),
			now: () => clock,
			resolveDefinition: async (value) => value,
			prepareExecution: async () => {
				throw new Error("not reached");
			},
		});
		const afterCompletion = {
			...definition(),
			schedule: {
				kind: "afterCompletion" as const,
				startsAt: "2026-09-28T00:00:00Z",
				intervalSeconds: 3600,
				timeZone: "UTC",
			},
		};
		const savePreview = await runtime.preview({
			definition: afterCompletion,
			intent: "save",
		});
		const created = await runtime.create({
			requestId: "save-after-completion",
			confirmationToken: savePreview.confirmationToken,
			runImmediately: false,
		});
		const enablePreview = await runtime.preview({
			definition: afterCompletion,
			automationId: created.automation.id,
			expectedVersion: 1,
			intent: "enable",
		});
		const enabled = await runtime.setScheduleState({
			requestId: "enable-after-completion",
			id: created.automation.id,
			expectedVersion: 1,
			state: "enabled",
			confirmationToken: enablePreview.confirmationToken,
		});
		expect(enabled.nextRunAt).toBe("2026-09-28T10:00:00.000Z");
		clock = Date.parse("2026-09-28T09:30:00Z");
		await runtime.tick();
		expect(runtime.get({ id: created.automation.id }).state).toBe("enabled");
		expect(runtime.get({ id: created.automation.id }).nextRunAt).toBe(
			"2026-09-28T10:00:00.000Z",
		);
		await runtime.stop();
		db.$client.close();
	});

	test("does not catch up after the exclusive end boundary", async () => {
		const db = createDatabase();
		let clock = Date.parse("2026-09-28T08:59:00Z");
		const runtime = createAutomationRuntime({
			db,
			driver: new HoldingDriver(),
			now: () => clock,
			resolveDefinition: async (value) => value,
			prepareExecution: async () => {
				throw new Error("must not dispatch");
			},
		});
		const finite = {
			...definition(),
			schedule: {
				kind: "fixedInterval" as const,
				startsAt: "2026-09-28T09:00:00Z",
				intervalSeconds: 600,
				timeZone: "UTC",
			},
			stop: { endsBefore: "2026-09-28T09:30:00Z" },
		};
		const savePreview = await runtime.preview({
			definition: finite,
			intent: "save",
		});
		const created = await runtime.create({
			requestId: "save-finite",
			confirmationToken: savePreview.confirmationToken,
			runImmediately: false,
		});
		const enablePreview = await runtime.preview({
			definition: finite,
			automationId: created.automation.id,
			expectedVersion: 1,
			intent: "enable",
		});
		await runtime.setScheduleState({
			requestId: "enable-finite",
			id: created.automation.id,
			expectedVersion: 1,
			state: "enabled",
			confirmationToken: enablePreview.confirmationToken,
		});
		clock = Date.parse("2026-09-28T09:45:00Z");
		await runtime.tick();
		expect(runtime.get({ id: created.automation.id }).state).toBe("finished");
		expect(
			runtime.listRuns({ automationId: created.automation.id }).items,
		).toHaveLength(0);
		await runtime.stop();
		db.$client.close();
	});

	test("uses the current after-completion revision when an older active round finishes", async () => {
		const db = createDatabase();
		const driver = new ScheduledDriver();
		let clock = Date.parse("2026-09-28T08:00:00Z");
		const runtime = createAutomationRuntime({
			db,
			driver,
			now: () => clock,
			resolveDefinition: async (value) => value,
			prepareExecution: async ({ workspaceId }) => ({
				workspaceId,
				cwd: "/tmp",
				env: {},
				instructions: "fixture",
			}),
		});
		const original = {
			...definition(),
			schedule: {
				kind: "afterCompletion" as const,
				startsAt: "2026-09-28T09:00:00Z",
				intervalSeconds: 3600,
				timeZone: "UTC",
			},
			stop: { maxRounds: 1 },
		};
		const savedPreview = await runtime.preview({
			definition: original,
			intent: "save",
		});
		const created = await runtime.create({
			requestId: "old-revision-save",
			confirmationToken: savedPreview.confirmationToken,
			runImmediately: false,
		});
		const enabledPreview = await runtime.preview({
			definition: original,
			automationId: created.automation.id,
			expectedVersion: 1,
			intent: "enable",
		});
		await runtime.setScheduleState({
			requestId: "old-revision-enable",
			id: created.automation.id,
			expectedVersion: 1,
			state: "enabled",
			confirmationToken: enabledPreview.confirmationToken,
		});
		clock = Date.parse("2026-09-28T09:00:00Z");
		await runtime.tick();
		await waitFor(
			() =>
				runtime.listRuns({ automationId: created.automation.id }).items[0]
					?.status === "running",
		);
		const revised = { ...original, stop: { maxRounds: 2 } };
		const updatePreview = await runtime.preview({
			definition: revised,
			automationId: created.automation.id,
			expectedVersion: 2,
			intent: "save",
		});
		const updated = await runtime.update({
			requestId: "new-revision-update",
			id: created.automation.id,
			expectedVersion: 2,
			confirmationToken: updatePreview.confirmationToken,
		});
		const reenablePreview = await runtime.preview({
			definition: revised,
			automationId: created.automation.id,
			expectedVersion: updated.version,
			intent: "enable",
		});
		await runtime.setScheduleState({
			requestId: "new-revision-enable",
			id: created.automation.id,
			expectedVersion: updated.version,
			state: "enabled",
			confirmationToken: reenablePreview.confirmationToken,
		});
		expect(runtime.get({ id: created.automation.id }).nextRunAt).toBeNull();
		await driver.observe?.({
			type: "report",
			report: {
				outcome: "completed",
				summary: "done",
				artifacts: [],
				verification: { status: "not_run", reason: "fixture" },
			},
		});
		await driver.observe?.({
			type: "ended",
			outcome: "completed",
			quiescent: true,
		});
		expect(runtime.get({ id: created.automation.id }).nextRunAt).toBe(
			"2026-09-28T10:00:00.000Z",
		);
		await runtime.stop();
		db.$client.close();
	});

	test("keeps an archived zero-interval schedule archived when its active round fails", async () => {
		const db = createDatabase();
		const driver = new ScheduledDriver();
		let clock = Date.parse("2026-09-28T08:59:00Z");
		const runtime = createAutomationRuntime({
			db,
			driver,
			now: () => clock,
			resolveDefinition: async (value) => value,
			prepareExecution: async ({ workspaceId }) => ({
				workspaceId,
				cwd: "/tmp",
				env: {},
				instructions: "fixture",
			}),
		});
		const continuous = {
			...definition(),
			schedule: {
				kind: "afterCompletion" as const,
				startsAt: "2026-09-28T09:00:00Z",
				intervalSeconds: 0,
				timeZone: "UTC",
			},
			stop: { maxRounds: 2 },
		};
		const savedPreview = await runtime.preview({
			definition: continuous,
			intent: "save",
		});
		const created = await runtime.create({
			requestId: "archive-continuous-save",
			confirmationToken: savedPreview.confirmationToken,
			runImmediately: false,
		});
		const enabledPreview = await runtime.preview({
			definition: continuous,
			automationId: created.automation.id,
			expectedVersion: 1,
			intent: "enable",
		});
		await runtime.setScheduleState({
			requestId: "archive-continuous-enable",
			id: created.automation.id,
			expectedVersion: 1,
			state: "enabled",
			confirmationToken: enabledPreview.confirmationToken,
		});
		clock = Date.parse("2026-09-28T09:00:00Z");
		await runtime.tick();
		await waitFor(
			() =>
				runtime.listRuns({ automationId: created.automation.id }).items[0]
					?.status === "running",
		);
		const beforeArchive = runtime.get({ id: created.automation.id });
		await runtime.archive({
			requestId: "archive-continuous",
			id: created.automation.id,
			expectedVersion: beforeArchive.version,
		});
		await driver.observe?.({
			type: "ended",
			outcome: "failed",
			quiescent: true,
			reason: "fixture failure",
		});
		expect(runtime.get({ id: created.automation.id }).state).toBe("archived");
		await runtime.stop();
		db.$client.close();
	});

	test("coalesces three overdue finite rounds into the last eligible round", async () => {
		const db = createDatabase();
		let clock = Date.parse("2026-09-28T08:59:00Z");
		const runtime = createAutomationRuntime({
			db,
			driver: new HoldingDriver(),
			now: () => clock,
			resolveDefinition: async (value) => value,
			prepareExecution: async ({ workspaceId }) => ({
				workspaceId,
				cwd: "/tmp",
				env: {},
				instructions: "fixture",
			}),
		});
		const finite = {
			...definition(),
			schedule: {
				kind: "fixedInterval" as const,
				startsAt: "2026-09-28T09:00:00Z",
				intervalSeconds: 600,
				timeZone: "UTC",
			},
			stop: { maxRounds: 3 },
			missedRunWindowSeconds: 3600,
		};
		const savedPreview = await runtime.preview({
			definition: finite,
			intent: "save",
		});
		const created = await runtime.create({
			requestId: "coalesce-save",
			confirmationToken: savedPreview.confirmationToken,
			runImmediately: false,
		});
		const enabledPreview = await runtime.preview({
			definition: finite,
			automationId: created.automation.id,
			expectedVersion: 1,
			intent: "enable",
		});
		await runtime.setScheduleState({
			requestId: "coalesce-enable",
			id: created.automation.id,
			expectedVersion: 1,
			state: "enabled",
			confirmationToken: enabledPreview.confirmationToken,
		});
		clock = Date.parse("2026-09-28T09:45:00Z");
		await runtime.tick();
		const runs = runtime.listRuns({
			automationId: created.automation.id,
		}).items;
		expect(runs).toHaveLength(3);
		expect(
			runs.filter((run) => run.status === "skipped").map((run) => run.reason),
		).toEqual(["coalesced", "coalesced"]);
		const active = runs.find(
			(run) => run.status === "preparing" || run.status === "running",
		);
		expect(active?.plannedAt).toBe("2026-09-28T09:20:00.000Z");
		await runtime.stop();
		db.$client.close();
	});

	test("automatic resume waits for an active scheduled after-completion round", async () => {
		const db = createDatabase();
		const driver = new ScheduledDriver();
		let clock = Date.parse("2026-09-28T08:59:00Z");
		const runtime = createAutomationRuntime({
			db,
			driver,
			now: () => clock,
			resolveDefinition: async (value) => value,
			prepareExecution: async ({ workspaceId }) => ({
				workspaceId,
				cwd: "/tmp",
				env: {},
				instructions: "fixture",
			}),
		});
		const recurring = {
			...definition(),
			schedule: {
				kind: "afterCompletion" as const,
				startsAt: "2026-09-28T09:00:00Z",
				intervalSeconds: 600,
				timeZone: "UTC",
			},
			stop: { maxRounds: 2 },
		};
		const savedPreview = await runtime.preview({
			definition: recurring,
			intent: "save",
		});
		const created = await runtime.create({
			requestId: "resume-active-save",
			confirmationToken: savedPreview.confirmationToken,
			runImmediately: false,
		});
		const enabledPreview = await runtime.preview({
			definition: recurring,
			automationId: created.automation.id,
			expectedVersion: 1,
			intent: "enable",
		});
		await runtime.setScheduleState({
			requestId: "resume-active-enable",
			id: created.automation.id,
			expectedVersion: 1,
			state: "enabled",
			confirmationToken: enabledPreview.confirmationToken,
		});
		clock = Date.parse("2026-09-28T09:09:00Z");
		await runtime.tick();
		await waitFor(
			() =>
				runtime.listRuns({ automationId: created.automation.id }).items[0]
					?.status === "running",
		);
		const running = runtime.get({ id: created.automation.id });
		await runtime.setScheduleState({
			requestId: "resume-active-pause",
			id: created.automation.id,
			expectedVersion: running.version,
			state: "paused",
			resumeAt: "2026-09-28T09:12:00Z",
		});
		clock = Date.parse("2026-09-28T09:12:00Z");
		await runtime.tick();
		const resumed = runtime.get({ id: created.automation.id });
		expect(resumed.state).toBe("enabled");
		expect(resumed.nextRunAt).toBeNull();
		expect(
			runtime.listRuns({ automationId: created.automation.id }).items,
		).toHaveLength(1);
		await driver.observe?.({
			type: "report",
			report: {
				outcome: "completed",
				summary: "done",
				artifacts: [],
				verification: { status: "not_run", reason: "fixture" },
			},
		});
		await driver.observe?.({
			type: "ended",
			outcome: "completed",
			quiescent: true,
		});
		expect(runtime.get({ id: created.automation.id }).nextRunAt).toBe(
			"2026-09-28T09:22:00.000Z",
		);
		await runtime.stop();
		db.$client.close();
	});

	test("manual activity does not leave an enabled after-completion schedule waiting forever", async () => {
		const db = createDatabase();
		let clock = Date.parse("2026-09-28T09:00:00Z");
		const runtime = createAutomationRuntime({
			db,
			driver: new HoldingDriver(),
			now: () => clock,
			resolveDefinition: async (value) => value,
			prepareExecution: async ({ workspaceId }) => ({
				workspaceId,
				cwd: "/tmp",
				env: {},
				instructions: "fixture",
			}),
		});
		const recurring = {
			...definition(),
			schedule: {
				kind: "afterCompletion" as const,
				startsAt: "2026-09-28T09:00:00Z",
				intervalSeconds: 600,
				timeZone: "UTC",
			},
			stop: { maxRounds: 2 },
		};
		const savedPreview = await runtime.preview({
			definition: recurring,
			intent: "save",
		});
		const created = await runtime.create({
			requestId: "manual-active-save",
			confirmationToken: savedPreview.confirmationToken,
			runImmediately: false,
		});
		await runtime.runNow({
			requestId: "manual-active-run",
			id: created.automation.id,
		});
		await waitFor(
			() =>
				runtime.listRuns({ automationId: created.automation.id }).items[0]
					?.status === "running",
		);
		const enabledPreview = await runtime.preview({
			definition: recurring,
			automationId: created.automation.id,
			expectedVersion: 1,
			intent: "enable",
		});
		const enabled = await runtime.setScheduleState({
			requestId: "manual-active-enable",
			id: created.automation.id,
			expectedVersion: 1,
			state: "enabled",
			confirmationToken: enabledPreview.confirmationToken,
		});
		expect(enabled.state).toBe("enabled");
		expect(enabled.nextRunAt).toBe("2026-09-28T09:10:00.000Z");
		await runtime.stop();
		db.$client.close();
	});

	test("idle after-completion auto-resume waits a full interval from actual handling time", async () => {
		const db = createDatabase();
		let clock = Date.parse("2026-09-28T09:00:00Z");
		const runtime = createAutomationRuntime({
			db,
			driver: new HoldingDriver(),
			now: () => clock,
			resolveDefinition: async (value) => value,
			prepareExecution: async ({ workspaceId }) => ({
				workspaceId,
				cwd: "/tmp",
				env: {},
				instructions: "fixture",
			}),
		});
		const recurring = {
			...definition(),
			schedule: {
				kind: "afterCompletion" as const,
				startsAt: "2026-09-28T09:00:00Z",
				intervalSeconds: 600,
				timeZone: "UTC",
			},
			stop: { maxRounds: 2 },
		};
		const savedPreview = await runtime.preview({
			definition: recurring,
			intent: "save",
		});
		const created = await runtime.create({
			requestId: "delayed-resume-save",
			confirmationToken: savedPreview.confirmationToken,
			runImmediately: false,
		});
		const enabledPreview = await runtime.preview({
			definition: recurring,
			automationId: created.automation.id,
			expectedVersion: 1,
			intent: "enable",
		});
		const enabled = await runtime.setScheduleState({
			requestId: "delayed-resume-enable",
			id: created.automation.id,
			expectedVersion: 1,
			state: "enabled",
			confirmationToken: enabledPreview.confirmationToken,
		});
		await runtime.setScheduleState({
			requestId: "delayed-resume-pause",
			id: created.automation.id,
			expectedVersion: enabled.version,
			state: "paused",
			resumeAt: "2026-09-28T09:10:00Z",
		});
		clock = Date.parse("2026-09-28T09:20:00Z");
		await runtime.tick();
		expect(runtime.get({ id: created.automation.id }).nextRunAt).toBe(
			"2026-09-28T09:30:00.000Z",
		);
		await runtime.stop();
		db.$client.close();
	});
});
