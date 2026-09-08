import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CdpTarget } from "../lib/cdp";
import { type DesktopE2ERuntime, startDesktopE2E } from "./runtime";
import type {
	DesktopE2ECase,
	DesktopE2ECaseResult,
	DesktopE2EContext,
	DesktopE2EStepResult,
} from "./types";
import { DesktopUi } from "./ui";

function errorDetails(error: unknown): string {
	return error instanceof Error
		? (error.stack ?? error.message)
		: String(error);
}

export async function runDesktopE2E(
	definitions: readonly DesktopE2ECase[],
): Promise<number> {
	assert.ok(definitions.length, "No E2E cases selected");
	const ids = new Set<string>();
	for (const definition of definitions) {
		assert.match(
			definition.id,
			/^[a-z0-9]+(?:-[a-z0-9]+)*$/,
			"Case IDs must be kebab-case",
		);
		assert.ok(!ids.has(definition.id), `Duplicate E2E case: ${definition.id}`);
		ids.add(definition.id);
	}

	const reportDir = await mkdtemp(join(tmpdir(), "choros-desktop-e2e-run-"));
	const results: DesktopE2ECaseResult[] = [];
	let runtime: DesktopE2ERuntime | undefined;
	let windows: DesktopUi[] = [];
	let interrupted = false;
	const summary = () => {
		let passed = 0;
		let failed = 0;
		for (const result of results) {
			for (const step of result.steps) {
				if (step.status === "passed") passed++;
				else failed++;
			}
		}
		return { cases: results.length, passed, failed };
	};
	const writeReport = () =>
		Bun.write(
			join(reportDir, "results.json"),
			JSON.stringify({ cases: results, summary: summary() }, null, 2),
		);
	const stopForSignal = () => {
		interrupted = true;
		for (const ui of windows) ui.cdp.close();
		void runtime?.close().finally(() => process.exit(130));
	};
	process.once("SIGINT", stopForSignal);
	process.once("SIGTERM", stopForSignal);
	console.log(`E2E report: ${join(reportDir, "results.json")}`);

	try {
		for (const definition of definitions) {
			if (interrupted) break;
			const result: DesktopE2ECaseResult = {
				id: definition.id,
				status: "running",
				artifactDir: join(reportDir, definition.id),
				steps: [],
			};
			results.push(result);
			await mkdir(result.artifactDir, { recursive: true });
			const attach = async (target: CdpTarget) => {
				const ui = await DesktopUi.connect(target);
				windows.push(ui);
				return ui;
			};
			const capture = async (step: DesktopE2EStepResult) => {
				const slug = step.name.replace(/[^a-z0-9-]+/gi, "-");
				for (const [index, ui] of windows.entries()) {
					const prefix = join(
						result.artifactDir,
						`${String(result.steps.length + 1).padStart(2, "0")}-${slug}-window-${index + 1}`,
					);
					try {
						await ui.screenshot(`${prefix}.png`);
						await Bun.write(
							`${prefix}.json`,
							JSON.stringify(
								{
									targetId: ui.targetId,
									...(await ui.state(definition.storageKeys)),
									console: ui.cdp.events,
								},
								null,
								2,
							),
						);
						step.artifacts.push(`${prefix}.png`, `${prefix}.json`);
					} catch (error) {
						step.status = "failed";
						step.error = `${step.error ?? ""}\nEvidence capture failed: ${errorDetails(error)}`;
					}
				}
			};
			try {
				runtime = await startDesktopE2E({ artifactDir: result.artifactDir });
				const activeRuntime = runtime;
				const target = (await activeRuntime.targets())[0];
				assert.ok(target, "isolated renderer missing");
				let primary = await attach(target);
				const context: DesktopE2EContext = {
					runtime: activeRuntime,
					get primary() {
						return primary;
					},
					get windows() {
						return windows;
					},
					async step(name, operation) {
						if (interrupted) throw new Error("E2E interrupted");
						const started = Date.now();
						const step: DesktopE2EStepResult = {
							name,
							status: "passed",
							durationMs: 0,
							artifacts: [],
						};
						for (const ui of windows) ui.cdp.events.length = 0;
						console.log(`RUN  ${definition.id}/${name}`);
						try {
							await operation();
							const errors = windows.flatMap((ui) => ui.errors());
							assert.equal(
								errors.length,
								0,
								`renderer emitted ${errors.length} console error(s) or uncaught exception(s); see per-window JSON`,
							);
						} catch (error) {
							step.status = "failed";
							step.error = errorDetails(error);
						}
						await capture(step);
						step.durationMs = Date.now() - started;
						result.steps.push(step);
						console.log(
							`${step.status === "passed" ? "PASS" : "FAIL"} ${definition.id}/${name} (${step.durationMs}ms)${step.error ? `\n${step.error}` : ""}`,
						);
						await writeReport();
						return step.status === "passed";
					},
					newWindow: async () => attach(await activeRuntime.newWindow()),
					async restart() {
						for (const ui of windows) ui.cdp.close();
						windows = [];
						primary = await attach(await activeRuntime.restart());
						return primary;
					},
				};
				await definition.run(context);
				assert.ok(
					result.steps.length,
					`${definition.id} did not record any test steps`,
				);
			} catch (error) {
				const step: DesktopE2EStepResult = {
					name: "case-execution",
					status: "failed",
					durationMs: 0,
					error: errorDetails(error),
					artifacts: [],
				};
				await capture(step);
				result.steps.push(step);
				console.error(`FAIL ${definition.id}: ${step.error}`);
			} finally {
				for (const ui of windows) ui.cdp.close();
				try {
					await runtime?.close();
				} catch (error) {
					result.steps.push({
						name: "owned-process-cleanup",
						status: "failed",
						durationMs: 0,
						error: errorDetails(error),
						artifacts: [],
					});
				}
				runtime = undefined;
				windows = [];
				result.status = result.steps.some((step) => step.status === "failed")
					? "failed"
					: "passed";
				await writeReport();
			}
		}
	} finally {
		process.removeListener("SIGINT", stopForSignal);
		process.removeListener("SIGTERM", stopForSignal);
		await writeReport();
	}
	const totals = summary();
	console.log(
		`\n${totals.cases} case(s): ${totals.passed} passed, ${totals.failed} failed. Report: ${join(reportDir, "results.json")}`,
	);
	return interrupted ? 130 : totals.failed ? 1 : 0;
}
