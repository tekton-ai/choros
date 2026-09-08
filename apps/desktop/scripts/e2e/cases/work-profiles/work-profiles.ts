import assert from "node:assert/strict";
import { join } from "node:path";
import { startTerminalServer } from "../../fixtures/terminal-server";
import { type DesktopE2ERuntime, eventually } from "../../runtime";
import type { DesktopE2ECase, DesktopE2EContext } from "../../types";
import type { DesktopUi } from "../../ui";
import {
	verifyManagerFirstClick,
	verifyManagerRename,
} from "./profile-dialogs";
import {
	backFromSettings,
	openExperiments,
	openWorkspaceList,
	recoverDashboard,
	selectProfile,
} from "./ui";

const PROFILE_B = "E2E Work B";
const PROJECT_A = "e2e-default-project";
const SWITCHES = [
	"inline-workspace-ports",
	"workspace-agents",
	"wait-for-setup-before-agent",
] as const;
type Flags = readonly [boolean, boolean, boolean];
export const workProfilesCase: DesktopE2ECase = {
	id: "work-profiles",
	description:
		"Profiles, experimental preferences, dialogs, live ports and multi-window navigation",
	storageKeys: ["inline-workspace-ports", "workspace-agents-row"],
	run: runWorkProfiles,
};

async function setFlags(ui: DesktopUi, flags: Flags) {
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

async function expectFlags(ui: DesktopUi, flags: Flags) {
	await ui.wait(
		SWITCHES.map(
			(id, index) =>
				`document.querySelector('#${id}')?.getAttribute('aria-checked') === '${flags[index]}'`,
		).join(" && "),
		`global experimental flags ${flags.join(",")}`,
		5000,
	);
}

async function assertProfile(ui: DesktopUi, name: string) {
	await ui.wait(
		`document.querySelector('button[aria-label^="Work Profile:"]')?.textContent.trim() === ${JSON.stringify(name)}`,
		`selected Profile ${name}`,
	);
}

async function createProfile(ui: DesktopUi, name: string) {
	await ui.click('button[aria-label^="Work Profile:"]');
	await ui.click('[role="menuitem"]', "New Profile");
	await ui.fill('[role="dialog"] input', name);
	await ui.click('[role="dialog"] button[type="submit"]');
	await ui.wait("!document.querySelector('[role=dialog]')", "profile saved");
}

async function createProject(ui: DesktopUi, runtime: DesktopE2ERuntime) {
	await ui.fill("#empty-project-name", PROJECT_A);
	await ui.fill("#empty-project-path", join(runtime.homeDir, "projects"));
	await ui.click('[role="dialog"] button', "Create project");
	await ui.wait(
		"!document.querySelector('#empty-project-name') && !!document.querySelector('button[aria-label^=\"Work Profile:\"]')",
		"real Host project creation",
		30_000,
	);
}

async function createSession(ui: DesktopUi) {
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
	await openWorkspaceList(ui);
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

async function portMenu(ui: DesktopUi, ownPort: number, otherPort?: number) {
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

// No model/provider calls: Wait-for-setup is verified as a setting, not agent execution ordering.
async function runWorkProfiles(context: DesktopE2EContext) {
	const activeRuntime = context.runtime;
	const record = context.step;
	let primary = context.primary;
	let secondary: DesktopUi | undefined;
	let settingsOrigins: { primary: string; secondary: string } | undefined;
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
			await openWorkspaceList(primary);
			await assertProfile(primary, "Default");
			await createProfile(primary, PROFILE_B);
			await selectProfile(primary, PROFILE_B);
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
		throw new Error("Fixture setup failed; dependent cases were not executed");
	assert.ok(sessionB, "session fixture must be complete");
	const createdSession = sessionB;

	await record("manage-profiles-opens-on-first-click", async () => {
		await verifyManagerFirstClick(primary);
	});
	await record("rename-profile-preserves-manager", async () => {
		await verifyManagerRename(primary, PROFILE_B, activeRuntime.artifactDir);
	});

	await record("project-and-session-profile-isolation", async () => {
		await selectProfile(primary, "Default");
		await openWorkspaceList(primary);
		assert.ok((await primary.state()).text.includes(PROJECT_A));
		assert.equal(
			(await primary.state()).text.includes(createdSession.name),
			false,
		);
		await selectProfile(primary, PROFILE_B);
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
				await recoverDashboard(primary);
				await selectProfile(primary, "Default");
				await openExperiments(primary);
				await setFlags(primary, flags);
				await backFromSettings(primary);
				await selectProfile(primary, PROFILE_B);
				await openExperiments(primary);
				await expectFlags(primary, flags);
				await backFromSettings(primary);
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
			await recoverDashboard(primary);
			await selectProfile(primary, "Default");
			await openWorkspaceList(primary);
			await primary.click("button:has(p)", PROJECT_A);
			await primary.wait(
				"location.hash.startsWith('#/v2-workspace/')",
				"open Default project workspace",
			);
			const workspaceA = await primary.cdp.eval<string>(
				"location.hash.split('/')[2]?.split('?')[0]",
			);
			portA = await startTerminalServer(
				primary,
				activeRuntime,
				workspaceA,
				"profile-a-server",
			);
			await portMenu(primary, portA);
			await primary.key("Escape");
			await selectProfile(primary, PROFILE_B);
			await openWorkspaceList(primary);
			await primary.click("button:has(p)", createdSession.name);
			await primary.wait(
				`location.hash === ${JSON.stringify(createdSession.route)}`,
				"open the exact B session",
			);
			const workspaceB = await primary.cdp.eval<string>(
				"location.hash.split('/')[2]?.split('?')[0]",
			);
			portB = await startTerminalServer(
				primary,
				activeRuntime,
				workspaceB,
				"profile-b-server",
			);
			await portMenu(primary, portB, portA);
			await primary.key("Escape");
			for (let repeat = 0; repeat < 3; repeat++) {
				await selectProfile(primary, "Default");
				await portMenu(primary, portA, portB);
				await primary.key("Escape");
				await selectProfile(primary, PROFILE_B);
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
			await selectProfile(primary, "Default");
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
		await recoverDashboard(primary);
		await selectProfile(primary, "Default");
		await openWorkspaceList(primary);
		await openExperiments(primary);
		await setFlags(primary, [false, false, false]);
		await backFromSettings(primary);
		secondary = await context.newWindow();
		await secondary.wait(
			"!!document.querySelector('button[aria-label^=\"Work Profile:\"]')",
			"second window dashboard",
			30_000,
		);
		await selectProfile(secondary, PROFILE_B);
		await openWorkspaceList(secondary);
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
			await openExperiments(primary);
			await openExperiments(secondary);
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
		await backFromSettings(secondary);
		await assertProfile(secondary, PROFILE_B);
		assert.equal(
			await secondary.cdp.eval<string>("location.hash"),
			settingsOrigins.secondary,
		);
		assert.equal(
			await primary.cdp.eval<string>("location.hash"),
			"#/settings/experimental",
		);
		await backFromSettings(primary);
		assert.equal(
			await primary.cdp.eval<string>("location.hash"),
			settingsOrigins.primary,
		);
		await assertProfile(primary, "Default");

		await openExperiments(secondary);
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
			for (const ui of context.windows) await recoverDashboard(ui);
			await selectProfile(primary, PROFILE_B);
			await openWorkspaceList(primary);
			primary = await context.restart();
			secondary = undefined;
			await primary.wait(
				"!!document.querySelector('button[aria-label^=\"Work Profile:\"]')",
				"restarted dashboard",
				30_000,
			);
			await assertProfile(primary, PROFILE_B);
			await openWorkspaceList(primary);
			await primary.wait(
				`document.body.innerText.includes(${JSON.stringify(createdSession.name)})`,
				"persisted session restored from Host",
				30_000,
			);
			assert.equal((await primary.state()).text.includes(PROJECT_A), false);
			await selectProfile(primary, "Default");
			assert.ok((await primary.state()).text.includes(PROJECT_A));
			assert.equal(
				(await primary.state()).text.includes(createdSession.name),
				false,
			);
			await openExperiments(primary);
			await expectFlags(primary, [true, true, true]);
			await backFromSettings(primary);
		},
	);
}
