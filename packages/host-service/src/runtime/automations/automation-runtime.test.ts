import { Database as BunDatabase } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
	executionInputs,
	executionOperations,
	executionRuns,
	type HostDb,
} from "../../db";
import * as schema from "../../db/schema";
import { validatePermissionAnswer } from "../executions/permission-answer";
import type {
	ExecutionDriver,
	ExecutionDriverEvent,
	ExecutionDriverHandle,
} from "../executions/types";
import { ExecutionPreparationError } from "../executions/types";
import { shellSingleQuote } from "../setup/config";
import { runManagedScript } from "../setup/managed-script";
import {
	type AutomationRuntime,
	AutomationRuntimeError,
	createAutomationRuntime,
} from "./automation-runtime";

const migrationsFolder = join(import.meta.dir, "../../../drizzle");
const createdDirectories: string[] = [];

function openDatabase(path: string): HostDb {
	const sqlite = new BunDatabase(path, {
		create: true,
		readwrite: true,
	});
	sqlite.exec("PRAGMA journal_mode = WAL");
	sqlite.exec("PRAGMA foreign_keys = ON");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder });
	return db as unknown as HostDb;
}

function createDatabase(): HostDb {
	const directory = mkdtempSync(join(tmpdir(), "choros-automation-runtime-"));
	createdDirectories.push(directory);
	return openDatabase(join(directory, "host.sqlite"));
}

function createReopenableDatabase(): { db: HostDb; path: string } {
	const directory = mkdtempSync(join(tmpdir(), "choros-automation-runtime-"));
	createdDirectories.push(directory);
	const path = join(directory, "host.sqlite");
	return { db: openDatabase(path), path };
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

class PermissionDriver implements ExecutionDriver {
	observe?: (event: ExecutionDriverEvent) => Promise<void>;
	answerCalls = 0;

	async start(
		_request: Parameters<ExecutionDriver["start"]>[0],
		observe: (event: ExecutionDriverEvent) => Promise<void>,
	): Promise<ExecutionDriverHandle> {
		this.observe = observe;
		await observe({ type: "started", chatSessionId: "chat-permission" });
		await observe({
			type: "input",
			id: "00000000-0000-4000-8000-000000000098",
			kind: "permission",
			question: "Allow this command once?",
			options: [
				{ id: "accept", label: "Approve" },
				{ id: "cancel", label: "Stop" },
			],
		});
		return {
			chatSessionId: "chat-permission",
			cancel: async () => ({ quiescent: true }),
			answerInput: async (_id, answer) => {
				validatePermissionAnswer(answer, [
					{ id: "accept", label: "Approve" },
					{ id: "cancel", label: "Stop" },
				]);
				this.answerCalls += 1;
			},
		};
	}

	async inspect() {
		return { state: "running" as const };
	}

	async dispose() {}
}

function processIsAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code !== "ESRCH";
	}
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
	test("reopens SQLite and dispatches a prepared run without repeating setup", async () => {
		const initial = createReopenableDatabase();
		let setupCalls = 0;
		const firstRuntime = createAutomationRuntime({
			db: initial.db,
			driver: new HoldingDriver(),
			resolveDefinition: async (value) => value,
			prepareExecution: async ({ workspaceId, signal }) => {
				setupCalls += 1;
				await new Promise<void>((resolve) =>
					signal.addEventListener("abort", () => resolve(), { once: true }),
				);
				return {
					workspaceId,
					cwd: "/tmp/fixture-workspace",
					env: { PROVIDER_SECRET: "restored-not-persisted" },
					instructions: definition().instructions,
				};
			},
		});
		const preview = await firstRuntime.preview({
			definition: definition(),
			intent: "run",
		});
		const created = await firstRuntime.create({
			requestId: "prepared-before-restart",
			confirmationToken: preview.confirmationToken,
			runImmediately: true,
		});
		const run = created.run;
		if (!run?.executionId) throw new Error("Expected an accepted execution");
		const executionId = run.executionId;
		await waitFor(() => setupCalls === 1);
		initial.db.transaction((tx) => {
			tx.update(executionRuns)
				.set({ stage: "prepared" })
				.where(eq(executionRuns.id, executionId))
				.run();
			tx.update(executionOperations)
				.set({
					state: "completed",
					receipt: JSON.stringify({
						workspaceId: "00000000-0000-4000-8000-000000000001",
					}),
				})
				.where(
					and(
						eq(executionOperations.executionId, executionId),
						eq(executionOperations.kind, "prepare"),
					),
				)
				.run();
		});
		await firstRuntime.stop();
		initial.db.$client.close();

		const reopened = openDatabase(initial.path);
		const driver = new CompletingDriver();
		let restoreCalls = 0;
		const recoveredRuntime = createAutomationRuntime({
			db: reopened,
			driver,
			resolveDefinition: async (value) => value,
			prepareExecution: async () => {
				throw new Error("setup must not run after preparation completed");
			},
			restorePreparedExecution: async ({ snapshot }) => {
				restoreCalls += 1;
				return {
					workspaceId: snapshot.workspaceId,
					cwd: snapshot.cwd ?? "/tmp/fixture-workspace",
					env: { PROVIDER_SECRET: "restored-not-persisted" },
					instructions: snapshot.instructions ?? definition().instructions,
				};
			},
		});
		await recoveredRuntime.tick();
		await waitFor(
			() => recoveredRuntime.getRun({ id: run.id }).status === "succeeded",
		);
		expect(setupCalls).toBe(1);
		expect(restoreCalls).toBe(1);
		expect(driver.starts).toBe(1);
		expect(driver.seenSecret).toBe("restored-not-persisted");
		const preparation = reopened
			.select({ receipt: executionOperations.receipt })
			.from(executionOperations)
			.where(
				and(
					eq(executionOperations.executionId, executionId),
					eq(executionOperations.kind, "prepare"),
				),
			)
			.get();
		expect(preparation?.receipt).not.toContain("PROVIDER_SECRET");
		expect(preparation?.receipt).not.toContain("restored-not-persisted");
		await recoveredRuntime.stop();
		reopened.$client.close();
	});

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
		const runId = first.run?.id;
		if (!runId) throw new Error("Expected a run identity");
		await waitFor(() => runtime.getRun({ id: runId }).status === "succeeded");
		const run = runtime.getRun({ id: runId });
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
		const executionId = run.executionId;
		if (!executionId) throw new Error("Expected an execution identity");
		const preparation = db
			.select({ receipt: executionOperations.receipt })
			.from(executionOperations)
			.where(
				and(
					eq(executionOperations.executionId, executionId),
					eq(executionOperations.kind, "prepare"),
				),
			)
			.get();
		expect(JSON.parse(preparation?.receipt ?? "{}")).toEqual({
			workspaceId: "00000000-0000-4000-8000-000000000001",
			cwd: "/tmp/fixture-workspace",
			instructions: definition().instructions,
		});
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

	test("keeps listRuns cursors stable across newer head insertions", async () => {
		const db = createDatabase();
		const driver = new CompletingDriver();
		let clock = Date.parse("2026-09-29T00:00:00Z");
		const runtime = createAutomationRuntime({
			db,
			driver,
			now: () => clock,
			resolveDefinition: async (value) => value,
			prepareExecution: async ({ workspaceId }) => ({
				workspaceId,
				cwd: "/tmp/fixture-workspace",
				env: {},
				instructions: definition().instructions,
			}),
		});
		const preview = await runtime.preview({
			definition: definition(),
			intent: "save",
		});
		const created = await runtime.create({
			requestId: "cursor-save",
			confirmationToken: preview.confirmationToken,
		});
		const oldestToNewest: string[] = [];
		for (let index = 1; index <= 5; index += 1) {
			clock += 1_000;
			const run = await runtime.runNow({
				requestId: `cursor-run-${index}`,
				id: created.automation.id,
			});
			await waitFor(
				() => runtime.getRun({ id: run.id }).status === "succeeded",
			);
			oldestToNewest.push(run.id);
		}
		const originalOrder = [...oldestToNewest].reverse();
		const firstPage = runtime.listRuns({
			automationId: created.automation.id,
			limit: 2,
		});
		expect(firstPage.items.map((run) => run.id)).toEqual(
			originalOrder.slice(0, 2),
		);
		if (!firstPage.nextCursor) throw new Error("Expected a second page cursor");
		const secondPage = runtime.listRuns({
			automationId: created.automation.id,
			limit: 2,
			cursor: firstPage.nextCursor,
		});
		expect(secondPage.items.map((run) => run.id)).toEqual(
			originalOrder.slice(2, 4),
		);
		if (!secondPage.nextCursor) throw new Error("Expected a tail cursor");
		const oldTailCursor = secondPage.nextCursor;

		clock += 1_000;
		const inserted = await runtime.runNow({
			requestId: "cursor-new-head",
			id: created.automation.id,
		});
		await waitFor(
			() => runtime.getRun({ id: inserted.id }).status === "succeeded",
		);
		expect(
			runtime
				.listRuns({
					automationId: created.automation.id,
					limit: 2,
					cursor: oldTailCursor,
				})
				.items.map((run) => run.id),
		).toEqual(originalOrder.slice(4));

		const refreshedFirst = runtime.listRuns({
			automationId: created.automation.id,
			limit: 2,
		});
		if (!refreshedFirst.nextCursor)
			throw new Error("Expected refreshed second page cursor");
		const refreshedSecond = runtime.listRuns({
			automationId: created.automation.id,
			limit: 2,
			cursor: refreshedFirst.nextCursor,
		});
		expect(
			[...refreshedFirst.items, ...refreshedSecond.items].map((run) => run.id),
		).toEqual([inserted.id, ...originalOrder.slice(0, 3)]);
		if (!refreshedSecond.nextCursor)
			throw new Error("Expected refreshed tail cursor");
		const refreshedTail = runtime.listRuns({
			automationId: created.automation.id,
			limit: 2,
			cursor: refreshedSecond.nextCursor,
		});
		expect(refreshedTail.items.map((run) => run.id)).toEqual(
			originalOrder.slice(3),
		);
		expect(
			new Set(
				[
					...refreshedFirst.items,
					...refreshedSecond.items,
					...refreshedTail.items,
				].map((run) => run.id),
			).size,
		).toBe(6);
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
		const runId = created.run?.id;
		if (!runId) throw new Error("Expected a run identity");
		await waitFor(() => preparationEntered);
		await runtime.tick();
		expect(runtime.getRun({ id: runId }).status).toBe("preparing");
		await runtime.requestCancel({
			requestId: "cancel-prepare",
			runId,
		});
		await waitFor(() => runtime.getRun({ id: runId }).status === "cancelled");
		const cancelled = runtime.getRun({ id: runId });
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
		const runId = created.run?.id;
		if (!runId) throw new Error("Expected a run identity");
		await waitFor(() => runtime.getRun({ id: runId }).status === "waiting");
		const answer = runtime.answerInput({
			requestId: "answer-interactive",
			inputId: "00000000-0000-4000-8000-000000000099",
			expectedVersion: 1,
			answer: "yes",
		});
		await waitFor(() => driver.answerStarted);
		await runtime.requestCancel({
			requestId: "cancel-interactive",
			runId,
		});
		driver.completeAnswer();
		await answer;
		expect(runtime.getRun({ id: runId }).status).toBe("cancelled");
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
		const runId = created.run?.id;
		if (!runId) throw new Error("Expected a run identity");
		await waitFor(() => runtime.getRun({ id: runId }).status === "waiting");
		await driver.observe?.({
			type: "ended",
			outcome: "completed",
			quiescent: true,
		});
		expect(runtime.getRun({ id: runId }).status).toBe("needs_result");
		await driver.observe?.({
			type: "report",
			report: {
				outcome: "completed",
				summary: "Late result",
				artifacts: [],
				verification: { status: "not_run", reason: "fixture" },
			},
		});
		expect(runtime.getRun({ id: runId }).status).toBe("needs_result");
		await runtime.stop();
		db.$client.close();
	});

	test("keeps an invalid permission answer pending so a valid answer can still succeed", async () => {
		const driver = new PermissionDriver();
		const { runtime, db } = runtimeWith(driver);
		const preview = await runtime.preview({
			definition: definition(),
			intent: "run",
		});
		const created = await runtime.create({
			requestId: "permission-run",
			confirmationToken: preview.confirmationToken,
			runImmediately: true,
		});
		const runId = created.run?.id;
		if (!runId) throw new Error("Expected a run identity");
		await waitFor(() => runtime.getRun({ id: runId }).status === "waiting");
		// Persisted requests created before this fix may still contain long-lived
		// choices. Reading or answering them must not re-enable those grants.
		db.update(executionInputs)
			.set({
				options: JSON.stringify([
					{ id: "accept", label: "Approve" },
					{ id: "cancel", label: "Stop" },
					{ id: "acceptForSession", label: "Approve for session" },
				]),
			})
			.where(eq(executionInputs.id, "00000000-0000-4000-8000-000000000098"))
			.run();
		expect(
			runtime
				.getRun({ id: runId })
				.inputs[0]?.options?.map((option) => option.id),
		).toEqual(["accept", "cancel"]);

		let invalidError: unknown;
		try {
			await runtime.answerInput({
				requestId: "invalid-permission-answer",
				inputId: "00000000-0000-4000-8000-000000000098",
				expectedVersion: 1,
				answer: "acceptForSession",
			});
		} catch (error) {
			invalidError = error;
		}
		expect(invalidError).toBeInstanceOf(AutomationRuntimeError);
		expect((invalidError as AutomationRuntimeError).code).toBe(
			"INVALID_PERMISSION_ANSWER",
		);
		expect(runtime.getRun({ id: runId }).inputs[0]).toMatchObject({
			status: "pending",
			version: 1,
		});
		expect(driver.answerCalls).toBe(0);

		await runtime.answerInput({
			requestId: "valid-permission-answer",
			inputId: "00000000-0000-4000-8000-000000000098",
			expectedVersion: 1,
			answer: "accept",
		});
		expect(driver.answerCalls).toBe(1);
		expect(runtime.getRun({ id: runId }).inputs[0]).toMatchObject({
			status: "answered",
			version: 2,
			answer: "accept",
		});
		await runtime.stop();
		db.$client.close();
	});

	test("does not append duplicate unknown events and preserves occupancy", async () => {
		const driver = new ScheduledDriver();
		const { runtime, db } = runtimeWith(driver);
		const preview = await runtime.preview({
			definition: definition(),
			intent: "run",
		});
		const created = await runtime.create({
			requestId: "unknown-run",
			confirmationToken: preview.confirmationToken,
			runImmediately: true,
		});
		const runId = created.run?.id;
		const executionId = created.run?.executionId;
		if (!runId || !executionId)
			throw new Error("Expected execution identities");
		await waitFor(() => driver.observe !== undefined);

		await driver.observe?.({
			type: "unknown",
			reason: "provider_state_unknown",
		});
		await driver.observe?.({
			type: "unknown",
			reason: "provider_state_unknown",
		});
		const duplicateEvents = runtime
			.readEvents({ after: 0, limit: 100 })
			.events.filter((event) => event.type === "execution.unknown");
		expect(duplicateEvents).toHaveLength(1);
		const occupied = db
			.select()
			.from(executionRuns)
			.where(eq(executionRuns.id, executionId))
			.get();
		expect(occupied?.automationOccupancy).toBe(created.automation.id);
		expect(occupied?.workspaceOccupancy).toBe(
			"00000000-0000-4000-8000-000000000001",
		);

		await driver.observe?.({
			type: "unknown",
			reason: "provider_reconcile_failed",
		});
		expect(
			runtime
				.readEvents({ after: 0, limit: 100 })
				.events.filter((event) => event.type === "execution.unknown"),
		).toHaveLength(2);
		expect(runtime.getRun({ id: runId })).toMatchObject({
			status: "unknown",
			reason: "provider_reconcile_failed",
		});
		await runtime.stop();
		db.$client.close();
	});

	test("shutdown aborts and drains a real long-running preparation process", async () => {
		if (process.platform === "win32") return;
		const db = createDatabase();
		const directory = mkdtempSync(join(tmpdir(), "choros-shutdown-process-"));
		createdDirectories.push(directory);
		const pidFile = join(directory, "preparation.pid");
		const driver = new CompletingDriver();
		const runtime = createAutomationRuntime({
			db,
			driver,
			resolveDefinition: async (value) => value,
			prepareExecution: async ({ workspaceId, signal, onStage }) => {
				const script = `require("node:fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000)`;
				const result = await runManagedScript({
					command: `${shellSingleQuote(process.execPath)} -e ${shellSingleQuote(script)}`,
					cwd: directory,
					env: { PATH: process.env.PATH ?? "" },
					timeoutSeconds: 60,
					signal,
				});
				await onStage("setup_finished", workspaceId, {
					stage: "setup",
					exitCode: result.exitCode,
					output: result.output,
					truncated: result.truncated,
					quiescent: result.quiescent,
				});
				if (result.cancelled)
					throw new ExecutionPreparationError(
						"setup cancelled",
						"setup",
						"failed",
						result.quiescent,
					);
				throw new Error("Long-running preparation exited without cancellation");
			},
		});
		const preview = await runtime.preview({
			definition: definition(),
			intent: "run",
		});
		const created = await runtime.create({
			requestId: "shutdown-preparation",
			confirmationToken: preview.confirmationToken,
			runImmediately: true,
		});
		const runId = created.run?.id;
		if (!runId) throw new Error("Expected a run identity");
		await waitFor(() => existsSync(pidFile));
		const pid = Number(readFileSync(pidFile, "utf8"));
		expect(processIsAlive(pid)).toBe(true);

		await runtime.stop();
		expect(processIsAlive(pid)).toBe(false);
		expect(driver.starts).toBe(0);
		expect(runtime.getRun({ id: runId })).toMatchObject({
			status: "cancelled",
			reason: "preparation_cancelled",
		});

		db.$client.close();
	});
	test("keeps non-quiescent preparation shutdown unknown and occupied", async () => {
		const db = createDatabase();
		let preparationEntered = false;
		const runtime = createAutomationRuntime({
			db,
			driver: new CompletingDriver(),
			resolveDefinition: async (value) => value,
			prepareExecution: async ({ signal }) => {
				preparationEntered = true;
				return await new Promise<never>((_resolve, reject) => {
					signal.addEventListener(
						"abort",
						() =>
							reject(
								new ExecutionPreparationError(
									"process tree may still be active",
									"setup",
									"unknown",
									false,
								),
							),
						{ once: true },
					);
				});
			},
		});
		const preview = await runtime.preview({
			definition: definition(),
			intent: "run",
		});
		const created = await runtime.create({
			requestId: "shutdown-unconfirmed-preparation",
			confirmationToken: preview.confirmationToken,
			runImmediately: true,
		});
		const runId = created.run?.id;
		const executionId = created.run?.executionId;
		if (!runId || !executionId)
			throw new Error("Expected execution identities");
		await waitFor(() => preparationEntered);

		await runtime.stop();
		expect(runtime.getRun({ id: runId })).toMatchObject({
			status: "unknown",
			reason: "preparation_stop_unconfirmed",
		});
		const execution = db
			.select()
			.from(executionRuns)
			.where(eq(executionRuns.id, executionId))
			.get();
		expect(execution?.automationOccupancy).toBe(created.automation.id);
		expect(execution?.workspaceOccupancy).not.toBeNull();
		db.$client.close();
	});
	test("a concurrent start cannot cross the shutdown fence, while a later start can resume accepted work", async () => {
		const driver = new CompletingDriver();
		const { runtime, db } = runtimeWith(driver);
		const stopping = runtime.stop();
		const concurrentStart = runtime.start();
		await Promise.all([stopping, concurrentStart]);
		const preview = await runtime.preview({
			definition: definition(),
			intent: "run",
		});
		const created = await runtime.create({
			requestId: "accepted-behind-shutdown-fence",
			confirmationToken: preview.confirmationToken,
			runImmediately: true,
		});
		const runId = created.run?.id;
		if (!runId) throw new Error("Expected a run identity");
		await Bun.sleep(10);
		expect(driver.starts).toBe(0);
		expect(runtime.getRun({ id: runId }).status).toBe("preparing");

		await runtime.start();
		await waitFor(() => runtime.getRun({ id: runId }).status === "succeeded");
		expect(driver.starts).toBe(1);
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

	test("reopens SQLite and records expired rounds without dispatching", async () => {
		const initial = createReopenableDatabase();
		let clock = Date.parse("2026-09-28T08:59:00Z");
		const runtime = createAutomationRuntime({
			db: initial.db,
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
		await runtime.stop();
		initial.db.$client.close();
		clock = Date.parse("2026-09-28T09:45:00Z");
		const reopened = openDatabase(initial.path);
		const driver = new CompletingDriver();
		const recoveredRuntime = createAutomationRuntime({
			db: reopened,
			driver,
			now: () => clock,
			resolveDefinition: async (value) => value,
			prepareExecution: async () => {
				throw new Error("must not dispatch");
			},
		});
		await recoveredRuntime.tick();
		const recovered = recoveredRuntime.get({ id: created.automation.id });
		expect(recovered.state).toBe("finished");
		expect(recovered.usedRounds).toBe(3);
		const runs = [
			...recoveredRuntime.listRuns({ automationId: created.automation.id })
				.items,
		].sort((left, right) =>
			(left.plannedAt ?? "").localeCompare(right.plannedAt ?? ""),
		);
		expect(runs.map((run) => run.plannedAt)).toEqual([
			"2026-09-28T09:00:00.000Z",
			"2026-09-28T09:10:00.000Z",
			"2026-09-28T09:20:00.000Z",
		]);
		expect(runs.map((run) => [run.status, run.reason])).toEqual([
			["skipped", "end_boundary"],
			["skipped", "end_boundary"],
			["skipped", "end_boundary"],
		]);
		expect(driver.starts).toBe(0);
		expect(
			recoveredRuntime
				.readEvents({ after: 0, limit: 100 })
				.events.some((event) => event.type === "automation.finished"),
		).toBe(true);
		await recoveredRuntime.stop();
		reopened.$client.close();
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
		const clock = Date.parse("2026-09-28T09:00:00Z");
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
