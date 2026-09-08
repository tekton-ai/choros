import assert from "node:assert/strict";
import { join } from "node:path";
import type { ProfileUi } from "./ui";

function findDialog(title: string) {
	return `[...document.querySelectorAll('[role="dialog"]')].find(dialog => dialog.querySelector('[data-slot="dialog-title"]')?.textContent.trim() === ${JSON.stringify(title)})`;
}

async function dialogSelector(ui: ProfileUi, title: string) {
	await ui.wait(
		`(${findDialog(title)})?.getAttribute('data-state') === 'open'`,
		`${title} stays open`,
	);
	const id = await ui.cdp.eval<string | null>(
		`(${findDialog(title)})?.id ?? null`,
	);
	assert.ok(id, `${title} disappeared before interaction`);
	const selector = `[role="dialog"][id=${JSON.stringify(id)}]`;
	await ui.wait(
		`(() => {
		const dialog = document.querySelector(${JSON.stringify(selector)});
		return dialog?.getAttribute('data-state') === 'open'
			&& getComputedStyle(dialog).opacity === '1'
			&& !dialog.getAnimations().some(animation => animation.playState === 'running' || animation.pending);
	})()`,
		`${title} opening animation settled`,
	);
	return selector;
}

async function managerStillOpen(ui: ProfileUi, selector: string) {
	await ui.wait(
		`document.querySelector(${JSON.stringify(selector)})?.getAttribute('data-state') === 'open'`,
		"manager remains open across child dialog transitions",
	);
}

async function openManager(ui: ProfileUi) {
	await ui.click('button[aria-label^="Work Profile:"]');
	await ui.click('[role="menuitem"]', "Manage Profiles");
	// The first click must survive the dropdown's exit/focus restoration. There
	// is deliberately no retry click or timer-based reopening of the manager.
	await ui.wait(
		"!document.querySelector('[role=menu]')",
		"source menu fully closed",
	);
	return dialogSelector(ui, "Manage Profiles");
}

async function closeManager(ui: ProfileUi, manager: string) {
	await ui.click(`${manager} button[data-slot="dialog-close"]`);
	await ui.wait(
		`!(${findDialog("Manage Profiles")})`,
		"manager closed normally",
	);
}

export async function verifyManagerFirstClick(ui: ProfileUi) {
	for (let opening = 0; opening < 2; opening++) {
		const manager = await openManager(ui);
		const search = `${manager} input[aria-label^="Search projects and sessions"]`;
		await ui.fill(search, "e2e");
		await managerStillOpen(ui, manager);
		await ui.fill(search, "");
		await closeManager(ui, manager);
	}
}

export async function verifyManagerRename(
	ui: ProfileUi,
	profileName: string,
	artifactDir: string,
) {
	const manager = await openManager(ui);
	const originalRow = `${manager} button[title=${JSON.stringify(profileName)}]`;
	const openRename = async (name: string) => {
		await ui.click(
			`${manager} button[aria-label=${JSON.stringify(`Rename ${name}`)}]`,
		);
		const rename = await dialogSelector(ui, "Rename Profile");
		await ui.wait(
			`document.querySelector(${JSON.stringify(`${rename} input`)})?.value === ${JSON.stringify(name)}`,
			"rename input has the current name",
		);
		await ui.wait(
			`document.activeElement?.matches(${JSON.stringify(`${rename} input`)})`,
			"rename input receives focus",
		);
		await managerStillOpen(ui, manager);
		return rename;
	};
	const renameClosed = async (selector: string) => {
		// Parent state clears the profile while the closing portal is still
		// animating; its title can change. Wait for the actual portal to unmount.
		await ui.wait(
			`!document.querySelector(${JSON.stringify(selector)})`,
			"only Rename closes",
		);
		await managerStillOpen(ui, manager);
	};

	let rename = await openRename(profileName);
	await ui.screenshot(join(artifactDir, "profile-rename-open.png"));
	await ui.fill(`${rename} input`, `${profileName} cancelled`);
	await ui.click(`${rename} button`, "Cancel");
	await renameClosed(rename);
	assert.equal(
		await ui.cdp.eval<boolean>(
			`!!document.querySelector(${JSON.stringify(originalRow)})`,
		),
		true,
	);

	rename = await openRename(profileName);
	await ui.key("Escape");
	await renameClosed(rename);
	assert.equal(
		await ui.cdp.eval<boolean>(
			`!!document.querySelector(${JSON.stringify(originalRow)})`,
		),
		true,
	);

	rename = await openRename(profileName);
	const point = await ui.cdp.eval<{ x: number; y: number }>(`(() => {
		const parent = document.querySelector(${JSON.stringify(manager)}).getBoundingClientRect();
		const child = document.querySelector(${JSON.stringify(rename)}).getBoundingClientRect();
		const point = {x: parent.left + 12, y: parent.top + 12};
		if (point.x >= child.left && point.x <= child.right && point.y >= child.top && point.y <= child.bottom) throw new Error('No outside-child point in manager');
		return point;
	})()`);
	await ui.cdp.send("Input.dispatchMouseEvent", {
		type: "mousePressed",
		...point,
		button: "left",
		clickCount: 1,
	});
	await ui.cdp.send("Input.dispatchMouseEvent", {
		type: "mouseReleased",
		...point,
		button: "left",
		clickCount: 1,
	});
	await renameClosed(rename);

	const renamed = `${profileName} renamed`;
	rename = await openRename(profileName);
	await ui.fill(`${rename} input`, renamed);
	await ui.click(`${rename} button[type="submit"]`);
	await renameClosed(rename);
	await ui.wait(
		`!!document.querySelector(${JSON.stringify(`${manager} button[title=${JSON.stringify(renamed)}]`)})`,
		"saved name appears without dismissing manager",
	);
	await ui.screenshot(join(artifactDir, "profile-manager-after-rename.png"));

	// Restore the fixture name through the same real save path so the rest of
	// the suite continues to exercise the original profile, not a substitute.
	rename = await openRename(renamed);
	await ui.fill(`${rename} input`, profileName);
	await ui.click(`${rename} button[type="submit"]`);
	await renameClosed(rename);
	await ui.wait(
		`!!document.querySelector(${JSON.stringify(originalRow)})`,
		"fixture profile name restored",
	);
	await closeManager(ui, manager);
}
