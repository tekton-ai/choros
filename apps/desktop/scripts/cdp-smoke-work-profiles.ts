/**
 * Real Electron Work Profiles + Experimental E2E.
 *
 *   bun run --cwd apps/desktop test:e2e:work-profiles
 *
 * Builds the real main/preload/renderer into a separate temporary app directory,
 * launches a fresh HOME/app DB/userData, and uses CDP input for every user action.
 * No cloud credentials or paid agents. The Wait option is covered as a global
 * setting; agent launch ordering is not claimed by this local-terminal suite.
 *
 * Each case records screenshots, DOM state and console events. Existing bugs
 * FAIL with exit 1, never an expected-failure/skip. Artifacts survive cleanup.
 * Keep this outside bun test: desktop's unit-test preload mocks Electron.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { CdpTarget } from "./lib/cdp";
import {
	verifyManagerFirstClick,
	verifyManagerRename,
} from "./work-profiles-e2e/profile-dialogs";
import {
	eventually,
	type ProfileE2ERuntime,
	startProfileE2E,
} from "./work-profiles-e2e/runtime";
import { ProfileUi } from "./work-profiles-e2e/ui";

const PROFILE_B = "E2E Work B";
const PROJECT_A = "e2e-default-project";
const SWITCHES = [
	"inline-workspace-ports",
	"workspace-agents",
	"wait-for-setup-before-agent",
] as const;
type Flags = readonly [boolean, boolean, boolean];
interface CaseResult {
	name: string;
	status: "passed" | "failed";
	durationMs: number;
	error?: string;
	artifacts: string[];
}
const portMarkerSchema = z.object({
	port: z.number().int().min(1).max(65535),
	pid: z.number().int().positive(),
	label: z.string(),
});

function shellQuote(value: string) {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

async function setFlags(ui: ProfileUi, flags: Flags) {
	for (const [index, id] of SWITCHES.entries()) {
		await ui.wait(
			`!!document.querySelector('#${id}:not(:disabled)')`,
			`${id} writable`,
		);
		const checked = await ui.cdp.eval<boolean>(
			`document.querySelector('#${id}').getAttribute('aria-checked') === 'true'`,
		);
		if (checked !== flags[index]) await ui.click(`#${id}`);
		await ui.wait(
			`document.querySelector('#${id}:not(:disabled)')?.getAttribute('aria-checked') === '${flags[index]}'`,
			`${id} saved`,
		);
	}
}

async function expectFlags(ui: ProfileUi, flags: Flags) {
	await ui.wait(
		SWITCHES.map(
			(id, index) =>
				`document.querySelector('#${id}')?.getAttribute('aria-checked') === '${flags[index]}'`,
		).join(" && "),
		`global experimental flags ${flags.join(",")}`,
		5000,
	);
}

async function assertProfile(ui: ProfileUi, name: string) {
	await ui.wait(
		`document.querySelector('button[aria-label^="Work Profile:"]')?.textContent.trim() === ${JSON.stringify(name)}`,
		`selected Profile ${name}`,
	);
}

async function createProfile(ui: ProfileUi, name: string) {
	await ui.click('button[aria-label^="Work Profile:"]');
	await ui.click('[role="menuitem"]', "New Profile");
	await ui.fill('[role="dialog"] input', name);
	await ui.click('[role="dialog"] button[type="submit"]');
	await ui.wait("!document.querySelector('[role=dialog]')", "profile saved");
}

async function createProject(ui: ProfileUi, runtime: ProfileE2ERuntime) {
	await ui.fill("#empty-project-name", PROJECT_A);
	await ui.fill("#empty-project-path", join(runtime.homeDir, "projects"));
	await ui.click('[role="dialog"] button', "Create project");
	await ui.wait(
		"!document.querySelector('#empty-project-name') && !!document.querySelector('button[aria-label^=\"Work Profile:\"]')",
		"real Host project creation",
		30_000,
	);
}

async function createSession(ui: ProfileUi) {
	await ui.click('button[aria-label="New session"]');
	await ui.wait(
		"location.hash.startsWith('#/new-workspace')",
		"session creation screen",
	);
	// Empty task context is the supported no-agent path, even when a vendor
	// is selected. It also avoids AI naming; no credentials are needed.
	await ui.wait(
		"[...document.querySelectorAll('[contenteditable=true]')].some(e => e.getBoundingClientRect().height > 0 && !e.textContent.trim())",
		"empty session task context",
	);
	await ui.click('button[aria-label="Submit"][type="submit"]');
	await ui.wait(
		"location.hash.startsWith('#/v2-workspace/') && [...document.querySelectorAll('button')].some(e => e.textContent.includes('Open Terminal'))",
		"real standalone session creation",
		30_000,
	);
	const route = await ui.cdp.eval<string>("location.hash");
	await ui.workspaceList();
	await ui.wait(
		"document.querySelectorAll('button:has(p)').length === 1",
		"one canonical session card",
	);
	const name = await ui.cdp.eval<string>(
		"document.querySelector('button:has(p) p').textContent.trim()",
	);
	assert.ok(name, "created session must have a visible name");
	return { route, name };
}

async function startPort(
	ui: ProfileUi,
	runtime: ProfileE2ERuntime,
	label: string,
) {
	await ui.button("Open Terminal");
	await ui.terminalReady();
	await ui.click(".xterm-screen");
	await ui.wait(
		"document.activeElement?.classList.contains('xterm-helper-textarea')",
		"real terminal focus",
	);
	const markerPath = join(runtime.artifactDir, `${label}.json`);
	const fixture = join(
		runtime.desktopDir,
		"scripts/work-profiles-e2e/port-server.ts",
	);
	await ui.cdp.send("Input.insertText", {
		text: `${shellQuote(process.execPath)} ${shellQuote(fixture)} ${shellQuote(markerPath)} ${shellQuote(label)}`,
	});
	await ui.key("Enter");
	const marker = await eventually(
		`${label} launched by app terminal`,
		async () =>
			existsSync(markerPath)
				? portMarkerSchema.parse(await Bun.file(markerPath).json())
				: null,
		25_000,
	);
	assert.equal(
		await (await fetch(`http://127.0.0.1:${marker.port}`)).text(),
		label,
	);
	return marker.port;
}

async function portMenu(ui: ProfileUi, ownPort: number, otherPort?: number) {
	await ui.wait(
		"!!document.querySelector('button[aria-label^=\"Ports — \"]')",
		"live port dropdown",
		40_000,
	);
	await ui.click('button[aria-label^="Ports — "]');
	await ui.wait(
		`!!document.querySelector('button[aria-label="Close port ${ownPort}"]')`,
		`current Profile port ${ownPort}`,
		40_000,
	);
	if (otherPort)
		assert.equal(
			await ui.cdp.eval<boolean>(
				`!!document.querySelector('button[aria-label="Close port ${otherPort}"]')`,
			),
			false,
			"other Profile port leaked into dropdown",
		);
}

async function main() {
	const results: CaseResult[] = [];
	let runtime: ProfileE2ERuntime | undefined;
	let windows: ProfileUi[] = [];
	let primary: ProfileUi;
	let secondary: ProfileUi | undefined;
	let settingsOrigins: { primary: string; secondary: string } | undefined;
	let interrupted = false;
	const stopForSignal = () => {
		interrupted = true;
		for (const ui of windows) ui.cdp.close();
		void runtime?.close().finally(() => process.exit(130));
	};
	process.once("SIGINT", stopForSignal);
	process.once("SIGTERM", stopForSignal);

	const attach = async (target: CdpTarget) => {
		const ui = await ProfileUi.connect(target);
		windows.push(ui);
		return ui;
	};
	const record = async (name: string, operation: () => Promise<void>) => {
		if (interrupted) throw new Error("E2E interrupted");
		assert.ok(runtime, "E2E runtime must be ready before running a case");
		const caseRuntime = runtime;
		const started = Date.now();
		const result: CaseResult = {
			name,
			status: "passed",
			durationMs: 0,
			artifacts: [],
		};
		for (const ui of windows) ui.cdp.events.length = 0;
		console.log(`RUN  ${name}`);
		try {
			await operation();
			const errors = windows.flatMap((ui) => ui.errors());
			assert.equal(
				errors.length,
				0,
				`renderer emitted ${errors.length} console error(s) or uncaught exception(s); see per-window JSON`,
			);
		} catch (error) {
			result.status = "failed";
			result.error =
				error instanceof Error ? (error.stack ?? error.message) : String(error);
		}
		for (const [index, ui] of windows.entries()) {
			const prefix = join(
				caseRuntime.artifactDir,
				`${String(results.length + 1).padStart(2, "0")}-${name}-window-${index + 1}`,
			);
			try {
				await ui.screenshot(`${prefix}.png`);
				await Bun.write(
					`${prefix}.json`,
					JSON.stringify(
						{
							targetId: ui.targetId,
							...(await ui.state()),
							console: ui.cdp.events,
						},
						null,
						2,
					),
				);
				result.artifacts.push(`${prefix}.png`, `${prefix}.json`);
			} catch (error) {
				result.status = "failed";
				result.error = `${result.error ?? ""}\nEvidence capture failed: ${String(error)}`;
			}
		}
		result.durationMs = Date.now() - started;
		results.push(result);
		console.log(
			`${result.status === "passed" ? "PASS" : "FAIL"} ${name} (${result.durationMs}ms)${result.error ? `\n${result.error}` : ""}`,
		);
		await Bun.write(
			join(caseRuntime.artifactDir, "results.json"),
			JSON.stringify(
				{
					origin: caseRuntime.origin,
					desktopDir: caseRuntime.desktopDir,
					cases: results,
				},
				null,
				2,
			),
		);
		return result.status === "passed";
	};

	try {
		runtime = await startProfileE2E();
		const firstTarget = (await runtime.targets())[0];
		assert.ok(firstTarget, "isolated renderer missing");
		primary = await attach(firstTarget);
		const activeRuntime = runtime;

		let sessionB: { route: string; name: string } | undefined;
		let fixtureOperationFinished = false;
		const initialized = await record(
			"onboarding-and-profile-fixtures",
			async () => {
				await primary.wait(
					"location.hash.startsWith('#/onboarding')",
					"fresh onboarding",
					30_000,
				);
				// Select the native English label through the real language picker.
				await primary.click('[role="combobox"]');
				await primary.click('[role="option"]', "English");
				await primary.button("Continue");
				await primary.wait(
					"location.hash === '#/onboarding/project'",
					"project onboarding",
				);
				await primary.button("Create");
				await createProject(primary, activeRuntime);
				await primary.workspaceList();
				await assertProfile(primary, "Default");
				await createProfile(primary, PROFILE_B);
				await primary.profile(PROFILE_B);
				assert.equal(
					(await primary.state()).text.includes(PROJECT_A),
					false,
					"Default project visible in empty Profile B",
				);
				sessionB = await createSession(primary);
				assert.ok(
					(await primary.state()).text.includes(sessionB.name),
					"B session missing after creation",
				);
				fixtureOperationFinished = true;
			},
		);
		if (!initialized && !fixtureOperationFinished)
			throw new Error(
				"Fixture setup failed; dependent cases were not executed",
			);
		assert.ok(sessionB, "session fixture must be complete");
		const createdSession = sessionB;

		await record("manage-profiles-opens-on-first-click", async () => {
			await verifyManagerFirstClick(primary);
		});
		await record("rename-profile-preserves-manager", async () => {
			await verifyManagerRename(primary, PROFILE_B, activeRuntime.artifactDir);
		});

		await record("project-and-session-profile-isolation", async () => {
			await primary.profile("Default");
			await primary.workspaceList();
			assert.ok((await primary.state()).text.includes(PROJECT_A));
			assert.equal(
				(await primary.state()).text.includes(createdSession.name),
				false,
			);
			await primary.profile(PROFILE_B);
			assert.ok((await primary.state()).text.includes(createdSession.name));
			assert.equal((await primary.state()).text.includes(PROJECT_A), false);
		});

		for (let combination = 0; combination < 8; combination++) {
			const flags: Flags = [
				!!(combination & 1),
				!!(combination & 2),
				!!(combination & 4),
			];
			await record(
				`experimental-combination-${combination.toString(2).padStart(3, "0")}`,
				async () => {
					await primary.recoverDashboard();
					await primary.profile("Default");
					await primary.experiments();
					await setFlags(primary, flags);
					await primary.back();
					await primary.profile(PROFILE_B);
					await primary.experiments();
					await expectFlags(primary, flags);
					await primary.back();
					await assertProfile(primary, PROFILE_B);
					assert.equal((await primary.state()).text.includes(PROJECT_A), false);
				},
			);
		}

		let portA: number | undefined;
		let portB: number | undefined;
		await record(
			"live-ports-survive-profile-switch-and-stay-scoped",
			async () => {
				await primary.recoverDashboard();
				await primary.profile("Default");
				await primary.workspaceList();
				await primary.click("button:has(p)", PROJECT_A);
				await primary.wait(
					"location.hash.startsWith('#/v2-workspace/')",
					"open Default project workspace",
				);
				portA = await startPort(primary, activeRuntime, "profile-a-server");
				await portMenu(primary, portA);
				await primary.key("Escape");
				await primary.profile(PROFILE_B);
				await primary.workspaceList();
				await primary.click("button:has(p)", createdSession.name);
				await primary.wait(
					`location.hash === ${JSON.stringify(createdSession.route)}`,
					"open the exact B session",
				);
				portB = await startPort(primary, activeRuntime, "profile-b-server");
				await portMenu(primary, portB, portA);
				await primary.key("Escape");
				for (let repeat = 0; repeat < 3; repeat++) {
					await primary.profile("Default");
					await portMenu(primary, portA, portB);
					await primary.key("Escape");
					await primary.profile(PROFILE_B);
					await portMenu(primary, portB, portA);
					await primary.key("Escape");
				}
				assert.equal(
					await (await fetch(`http://127.0.0.1:${portA}`)).text(),
					"profile-a-server",
				);
				assert.equal(
					await (await fetch(`http://127.0.0.1:${portB}`)).text(),
					"profile-b-server",
				);
			},
		);

		await record(
			"closing-current-profile-port-preserves-other-profile",
			async () => {
				assert.ok(portA && portB, "live-port setup did not finish");
				await primary.key("Escape");
				await primary.profile("Default");
				await portMenu(primary, portA, portB);
				await primary.click(`button[aria-label="Close port ${portA}"]`);
				await primary.wait(
					"[...document.querySelectorAll('[role=dialog]')].some(e => e.textContent.includes('This port is still in use'))",
					"port-close confirmation",
				);
				await primary.click('[role="dialog"] button', "Close port");
				await eventually("A port closed", async () => {
					try {
						await fetch(`http://127.0.0.1:${portA}`, {
							signal: AbortSignal.timeout(1000),
						});
						return false;
					} catch {
						return true;
					}
				});
				assert.equal(
					await (await fetch(`http://127.0.0.1:${portB}`)).text(),
					"profile-b-server",
				);
			},
		);

		await record("independent-window-profile-selections", async () => {
			await primary.key("Escape");
			await primary.recoverDashboard();
			await primary.profile("Default");
			await primary.workspaceList();
			await primary.experiments();
			await setFlags(primary, [false, false, false]);
			await primary.back();
			secondary = await attach(await activeRuntime.newWindow());
			await secondary.wait(
				"!!document.querySelector('button[aria-label^=\"Work Profile:\"]')",
				"second window dashboard",
				30_000,
			);
			await secondary.profile(PROFILE_B);
			await secondary.workspaceList();
			await secondary.fill(
				'input[placeholder^="Search workspaces"]',
				createdSession.name,
			);
			await secondary.wait(
				`new URL(location.hash.slice(1), location.origin).searchParams.get('q') === ${JSON.stringify(createdSession.name)}`,
				"second window search reflected in its URL",
			);
			await assertProfile(primary, "Default");
			await assertProfile(secondary, PROFILE_B);
		});

		await record(
			"experimental-settings-synchronize-between-windows",
			async () => {
				assert.ok(secondary, "second window setup failed");
				settingsOrigins = {
					primary: await primary.cdp.eval<string>("location.hash"),
					secondary: await secondary.cdp.eval<string>("location.hash"),
				};
				await primary.experiments();
				await secondary.experiments();
				await expectFlags(primary, [false, false, false]);
				await expectFlags(secondary, [false, false, false]);
				await setFlags(primary, [true, true, true]);
				// Do not reload, rehydrate a store or mutate IPC to make this pass.
				await expectFlags(secondary, [true, true, true]);
				await setFlags(secondary, [false, false, false]);
				await expectFlags(primary, [false, false, false]);
				await setFlags(primary, [true, true, true]);
				await expectFlags(secondary, [true, true, true]);
			},
		);

		await record("settings-reload-keeps-valid-back-navigation", async () => {
			assert.ok(secondary, "second window setup failed");
			assert.ok(settingsOrigins, "settings origin capture failed");
			await secondary.cdp.send("Page.reload");
			await secondary.wait(
				"!!document.querySelector('#workspace-agents')",
				"settings reloaded",
				30_000,
			);
			await expectFlags(secondary, [true, true, true]);
			await secondary.back();
			await assertProfile(secondary, PROFILE_B);
			assert.equal(
				await secondary.cdp.eval<string>("location.hash"),
				settingsOrigins.secondary,
			);
			assert.equal(
				await primary.cdp.eval<string>("location.hash"),
				"#/settings/experimental",
			);
			await primary.back();
			assert.equal(
				await primary.cdp.eval<string>("location.hash"),
				settingsOrigins.primary,
			);
			await assertProfile(primary, "Default");

			await secondary.experiments();
			await secondary.cdp.send("Page.reload");
			await secondary.wait(
				"!!document.querySelector('#workspace-agents')",
				"settings reloaded for Escape",
			);
			await secondary.key("Escape");
			await secondary.wait(
				`location.hash === ${JSON.stringify(settingsOrigins.secondary)}`,
				"Escape restores the same window-local origin and query",
			);
			await assertProfile(secondary, PROFILE_B);
			await secondary.fill('input[placeholder^="Search workspaces"]', "");
			await secondary.wait(
				"!new URL(location.hash.slice(1), location.origin).searchParams.has('q')",
				"clear fixture search before restart",
			);
		});

		await record(
			"full-electron-restart-preserves-profiles-membership-and-experiments",
			async () => {
				for (const ui of windows) await ui.recoverDashboard();
				await primary.profile(PROFILE_B);
				await primary.workspaceList();
				for (const ui of windows) ui.cdp.close();
				windows = [];
				const restarted = await activeRuntime.restart();
				primary = await attach(restarted);
				secondary = undefined;
				await primary.wait(
					"!!document.querySelector('button[aria-label^=\"Work Profile:\"]')",
					"restarted dashboard",
					30_000,
				);
				await assertProfile(primary, PROFILE_B);
				await primary.workspaceList();
				await primary.wait(
					`document.body.innerText.includes(${JSON.stringify(createdSession.name)})`,
					"persisted session restored from Host",
					30_000,
				);
				assert.equal((await primary.state()).text.includes(PROJECT_A), false);
				await primary.profile("Default");
				assert.ok((await primary.state()).text.includes(PROJECT_A));
				assert.equal(
					(await primary.state()).text.includes(createdSession.name),
					false,
				);
				await primary.experiments();
				await expectFlags(primary, [true, true, true]);
				await primary.back();
			},
		);
	} catch (error) {
		results.push({
			name: "suite-infrastructure",
			status: "failed",
			durationMs: 0,
			error: String(error),
			artifacts: [],
		});
		console.error(error);
	} finally {
		for (const ui of windows) ui.cdp.close();
		try {
			await runtime?.close();
		} catch (error) {
			results.push({
				name: "owned-process-cleanup",
				status: "failed",
				durationMs: 0,
				error: String(error),
				artifacts: [],
			});
		}
		process.removeListener("SIGINT", stopForSignal);
		process.removeListener("SIGTERM", stopForSignal);
		if (runtime)
			await Bun.write(
				join(runtime.artifactDir, "results.json"),
				JSON.stringify(
					{
						origin: runtime.origin,
						desktopDir: runtime.desktopDir,
						cases: results,
					},
					null,
					2,
				),
			);
	}
	const failed = results.filter((result) => result.status === "failed");
	console.log(
		`\n${results.length - failed.length} passed, ${failed.length} failed. Artifacts: ${runtime?.artifactDir ?? "see startup log"}`,
	);
	return failed.length ? 1 : 0;
}

process.exit(await main());
