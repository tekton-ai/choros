import type { DesktopUi } from "../../ui";

export async function selectProfile(ui: DesktopUi, name: string) {
	await ui.click('button[aria-label^="Work Profile:"]');
	await ui.click(`[role="menuitemradio"][title=${JSON.stringify(name)}]`);
	await ui.wait(
		`document.querySelector('button[aria-label^="Work Profile:"]')?.textContent.trim() === ${JSON.stringify(name)}`,
		`active Profile ${name}`,
	);
	await ui.wait(
		`!document.querySelector('[role="menu"]')`,
		"profile menu dismissed",
	);
}

export async function openExperiments(ui: DesktopUi) {
	if (
		!(await ui.cdp.eval<boolean>("location.hash.startsWith('#/settings/')"))
	) {
		await ui.click('button[aria-label="Settings"]');
	}
	await ui.click('a[href*="settings/experimental"]');
	await ui.wait(
		"!!document.querySelector('#wait-for-setup-before-agent:not(:disabled)')",
		"experimental controls ready",
	);
}

export async function backFromSettings(ui: DesktopUi) {
	await ui.click("a", "Back");
	await ui.wait(
		"!!document.querySelector('button[aria-label^=\"Work Profile:\"]') || document.body.innerText.includes('Page Not Found')",
		"settings return",
	);
	if (
		await ui.cdp.eval<boolean>(
			"document.body.innerText.includes('Page Not Found')",
		)
	) {
		throw new Error(
			`Settings Back reached Page Not Found: ${await ui.cdp.eval<string>("location.hash")}`,
		);
	}
}

export async function openWorkspaceList(ui: DesktopUi) {
	if (await ui.cdp.eval<boolean>("location.hash.startsWith('#/settings/')"))
		await backFromSettings(ui);
	await ui.button("Workspaces");
	await ui.wait(
		"location.hash === '#/v2-workspaces' && !!document.querySelector('input[placeholder^=\"Search workspaces\"]')",
		"workspace list ready",
	);
}

export async function recoverDashboard(ui: DesktopUi) {
	// Recovery between independent cases never changes the failed result.
	if (
		await ui.cdp.eval<boolean>(
			"document.body.innerText.includes('Page Not Found')",
		)
	) {
		await ui.click("a", "Go back home");
	}
	if (await ui.cdp.eval<boolean>("location.hash.startsWith('#/settings/')")) {
		try {
			await backFromSettings(ui);
		} catch {
			await ui.click("a", "Go back home");
		}
	}
	await ui.wait(
		"!!document.querySelector('button[aria-label^=\"Work Profile:\"]')",
		"dashboard recovered",
	);
}
