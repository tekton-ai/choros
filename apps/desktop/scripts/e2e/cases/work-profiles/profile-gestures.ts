import assert from "node:assert/strict";
import type { DesktopE2EContext } from "../../types";
import type { DesktopUi } from "../../ui";
import {
	backFromSettings,
	openExperiments,
	openWorkspaceList,
	selectProfile,
} from "./ui";

const SIDEBAR = "[data-dashboard-sidebar]";
const SWITCHER = 'button[aria-label^="Work Profile:"]';
const PROFILE_C = "E2E Gesture C";
interface Point {
	x: number;
	y: number;
}

async function point(
	ui: DesktopUi,
	selector: string,
	x = 0.5,
	y = 0.5,
): Promise<Point> {
	return ui.cdp.eval(`(() => {
		const element = document.querySelector(${JSON.stringify(selector)});
		if (!element) throw new Error('Missing gesture target: ' + ${JSON.stringify(selector)});
		const rect = element.getBoundingClientRect();
		if (!rect.width || !rect.height) throw new Error('Hidden gesture target');
		return { x: rect.x + rect.width * ${x}, y: rect.y + rect.height * ${y} };
	})()`);
}

async function wheel(
	ui: DesktopUi,
	target: Point,
	deltaX: number,
	deltaY = 0,
	modifiers = 0,
) {
	await ui.cdp.send("Input.dispatchMouseEvent", {
		type: "mouseMoved",
		...target,
	});
	await ui.cdp.send("Input.dispatchMouseEvent", {
		type: "mouseWheel",
		...target,
		deltaX,
		deltaY,
		modifiers,
	});
}

async function settle(ui: DesktopUi) {
	await ui.cdp.eval(
		"new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
	);
}

async function expectProfile(ui: DesktopUi, name: string) {
	await ui.wait(
		`document.querySelector(${JSON.stringify(SWITCHER)})?.getAttribute('aria-label')?.startsWith(${JSON.stringify(`Work Profile: ${name}.`)})`,
		`gesture selects ${name}`,
	);
}

async function unchanged(ui: DesktopUi, name: string, route: string) {
	await settle(ui);
	const label = await ui.cdp.eval<string>(
		`document.querySelector(${JSON.stringify(SWITCHER)}).getAttribute('aria-label')`,
	);
	assert.ok(
		label.startsWith(`Work Profile: ${name}.`),
		`gesture unexpectedly changed ${name}: ${label}`,
	);
	assert.equal(
		await ui.cdp.eval("location.hash"),
		route,
		"excluded gesture changed navigation",
	);
}

// The pause separates intentional gestures; packets within a gesture have no pause.
async function nextGesture() {
	await Bun.sleep(300);
}

export async function verifyProfileGestures(
	context: DesktopE2EContext,
	ui: DesktopUi,
	profileB: string,
	session: { name: string; route: string },
	projectName: string,
) {
	await context.step("profile-gesture-fixture", async () => {
		await selectProfile(ui, "Default");
		await openWorkspaceList(ui);
		await ui.click(SWITCHER);
		await ui.click('[role="menuitem"]', "New Profile");
		await ui.fill('[role="dialog"] input', PROFILE_C);
		await ui.click('[role="dialog"] button[type="submit"]');
		await ui.wait(
			"!document.querySelector('[role=dialog]')",
			"third Profile saved",
		);
	});

	await context.step(
		"profile-wheel-covers-header-rows-footer-and-blank-space",
		async () => {
			for (const selector of [
				`${SIDEBAR} > :first-child`,
				`${SIDEBAR} [aria-roledescription="sortable"]`,
				`${SIDEBAR} .overflow-y-auto`,
				`${SIDEBAR} > :last-child`,
				SWITCHER,
			]) {
				await selectProfile(ui, "Default");
				await openWorkspaceList(ui);
				const route = await ui.cdp.eval<string>("location.hash");
				const target = await point(ui, selector);
				await nextGesture();
				for (const delta of [45, 90, 70, -100]) await wheel(ui, target, delta);
				await expectProfile(ui, profileB);
				await unchanged(ui, profileB, route);
				const text = (await ui.state()).text;
				assert.ok(text.includes(session.name), "new Profile content missing");
				assert.equal(
					text.includes(projectName),
					false,
					"old Profile content remained",
				);
			}
		},
	);

	await context.step("profile-wheel-first-last-and-empty-profile", async () => {
		const target = await point(ui, `${SIDEBAR} .overflow-y-auto`);
		await nextGesture();
		await wheel(ui, target, 80);
		await expectProfile(ui, PROFILE_C);
		const route = await ui.cdp.eval<string>("location.hash");
		await nextGesture();
		await wheel(ui, target, 80);
		await unchanged(ui, PROFILE_C, route);
		await nextGesture();
		await wheel(ui, target, -80);
		await expectProfile(ui, profileB);
		await nextGesture();
		await wheel(ui, target, -80);
		await expectProfile(ui, "Default");
		await nextGesture();
		await wheel(ui, target, -80);
		await unchanged(ui, "Default", route);
	});

	await context.step(
		"profile-wheel-excludes-vertical-diagonal-pinch-and-menus",
		async () => {
			await selectProfile(ui, "Default");
			const route = await ui.cdp.eval<string>("location.hash");
			const target = await point(ui, `${SIDEBAR} .overflow-y-auto`);
			for (const packets of [
				[
					[2, 80, 0],
					[100, 0, 0],
				],
				[[45, 40, 0]],
				[
					[80, 0, 2],
					[100, 0, 0],
				],
			]) {
				await nextGesture();
				for (const [dx, dy, modifiers] of packets)
					await wheel(ui, target, dx, dy, modifiers);
				await unchanged(ui, "Default", route);
			}
			await nextGesture();
			await wheel(ui, await point(ui, "body", 0.8, 0.5), 100);
			await unchanged(ui, "Default", route);
			await ui.click(SWITCHER);
			await nextGesture();
			await wheel(ui, await point(ui, '[role="menu"]'), 100);
			await unchanged(ui, "Default", route);
			await ui.key("Escape");
			await ui.click(SWITCHER);
			await ui.click('[role="menuitem"]', "New Profile");
			await nextGesture();
			await wheel(ui, await point(ui, '[role="dialog"]'), 100);
			await unchanged(ui, "Default", route);
			await ui.key("Escape");
		},
	);

	await context.step("profile-wheel-preserves-drag-and-resize", async () => {
		await selectProfile(ui, "Default");
		const route = await ui.cdp.eval<string>("location.hash");
		const row = await point(ui, `${SIDEBAR} [aria-roledescription="sortable"]`);
		await nextGesture();
		await ui.cdp.send("Input.dispatchMouseEvent", {
			type: "mousePressed",
			...row,
			button: "left",
			buttons: 1,
			clickCount: 1,
		});
		try {
			await wheel(ui, row, 100);
			await unchanged(ui, "Default", route);
			await ui.cdp.send("Input.dispatchMouseEvent", {
				type: "mouseMoved",
				x: row.x,
				y: row.y + 30,
				button: "left",
				buttons: 1,
			});
			await nextGesture();
			await wheel(ui, row, 100);
			await unchanged(ui, "Default", route);
		} finally {
			await ui.key("Escape");
			await ui.cdp.send("Input.dispatchMouseEvent", {
				type: "mouseReleased",
				...row,
				button: "left",
				clickCount: 1,
			});
		}
		const separator = '[role="separator"][aria-orientation="vertical"]';
		const handle = await point(ui, separator);
		const width = await ui.cdp.eval<number>(
			`Number(document.querySelector(${JSON.stringify(separator)}).getAttribute('aria-valuenow'))`,
		);
		await ui.cdp.send("Input.dispatchMouseEvent", {
			type: "mousePressed",
			...handle,
			button: "left",
			buttons: 1,
			clickCount: 1,
		});
		try {
			await ui.cdp.send("Input.dispatchMouseEvent", {
				type: "mouseMoved",
				x: handle.x + 30,
				y: handle.y,
				button: "left",
				buttons: 1,
			});
			await ui.wait(
				`Number(document.querySelector(${JSON.stringify(separator)}).getAttribute('aria-valuenow')) > ${width}`,
				"sidebar resizes normally",
			);
			await nextGesture();
			await wheel(ui, await point(ui, `${SIDEBAR} .overflow-y-auto`), 100);
			await unchanged(ui, "Default", route);
		} finally {
			await ui.cdp.send("Input.dispatchMouseEvent", {
				type: "mouseMoved",
				...handle,
				button: "left",
				buttons: 1,
			});
			await ui.cdp.send("Input.dispatchMouseEvent", {
				type: "mouseReleased",
				...handle,
				button: "left",
				clickCount: 1,
			});
		}
	});

	await context.step(
		"profile-wheel-restores-workspace-and-survives-remount",
		async () => {
			await selectProfile(ui, profileB);
			await openWorkspaceList(ui);
			await ui.click("button:has(p)", session.name);
			await ui.wait(
				`location.hash === ${JSON.stringify(session.route)}`,
				"session before gesture",
			);
			await nextGesture();
			await wheel(ui, await point(ui, `${SIDEBAR} .overflow-y-auto`), -80);
			await expectProfile(ui, "Default");
			await ui.wait(
				`location.hash.startsWith('#/v2-workspace/') && location.hash !== ${JSON.stringify(session.route)}`,
				"gesture restores Default's visited workspace",
			);
			await nextGesture();
			await wheel(ui, await point(ui, `${SIDEBAR} .overflow-y-auto`), 80);
			await expectProfile(ui, profileB);
			await ui.wait(
				`location.hash === ${JSON.stringify(session.route)}`,
				"gesture restores real visited workspace",
			);
			await openExperiments(ui);
			await backFromSettings(ui);
			await nextGesture();
			await wheel(ui, await point(ui, `${SIDEBAR} .overflow-y-auto`), 80);
			await expectProfile(ui, PROFILE_C);
			await ui.wait(
				"!location.hash.startsWith('#/v2-workspace/')",
				"empty Profile exits foreign workspace",
			);
			const emptyRoute = await ui.cdp.eval<string>("location.hash");
			await nextGesture();
			await wheel(ui, await point(ui, `${SIDEBAR} .overflow-y-auto`), -80);
			await expectProfile(ui, profileB);
			await unchanged(ui, profileB, emptyRoute);
			await selectProfile(ui, "Default");
		},
	);

	await context.step(
		"profile-wheel-collapsed-rail-and-existing-button-inputs",
		async () => {
			const separator = '[role="separator"][aria-orientation="vertical"]';
			const initialWidth = await ui.cdp.eval<number>(
				`Number(document.querySelector(${JSON.stringify(separator)}).getAttribute('aria-valuenow'))`,
			);
			const resizeTo = async (width: number) => {
				const handle = await point(ui, separator);
				const currentWidth = await ui.cdp.eval<number>(
					`Number(document.querySelector(${JSON.stringify(separator)}).getAttribute('aria-valuenow'))`,
				);
				const target = { x: handle.x + width - currentWidth, y: handle.y };
				await ui.cdp.send("Input.dispatchMouseEvent", {
					type: "mousePressed",
					...handle,
					button: "left",
					buttons: 1,
					clickCount: 1,
				});
				try {
					await ui.cdp.send("Input.dispatchMouseEvent", {
						type: "mouseMoved",
						...target,
						button: "left",
						buttons: 1,
					});
					await settle(ui);
				} finally {
					await ui.cdp.send("Input.dispatchMouseEvent", {
						type: "mouseReleased",
						...target,
						button: "left",
						clickCount: 1,
					});
				}
			};
			await selectProfile(ui, "Default");
			await resizeTo(52);
			await ui.wait(
				`document.querySelector('${SIDEBAR}').getBoundingClientRect().width < 100`,
				"sidebar collapsed",
			);
			try {
				await nextGesture();
				for (const delta of [60, 80, -80])
					await wheel(
						ui,
						await point(ui, `${SIDEBAR} .overflow-y-auto`),
						delta,
					);
				await expectProfile(ui, profileB);
				await ui.screenshot(
					`${context.runtime.artifactDir}/profile-gesture-collapsed.png`,
				);
			} finally {
				await resizeTo(initialWidth);
			}
			await ui.wait(
				`document.querySelector('${SIDEBAR}').getBoundingClientRect().width > 100`,
				"sidebar expanded",
			);
			await ui.click(SWITCHER);
			await ui.key("Escape");
			await ui.wait(
				`document.activeElement === document.querySelector(${JSON.stringify(SWITCHER)}) && !document.querySelector('[role="menu"]')`,
				"menu restores keyboard focus to Profile button",
			);
			await ui.key("ArrowLeft");
			await expectProfile(ui, "Default");
			await ui.key("ArrowRight");
			await expectProfile(ui, profileB);
			await ui.key("ArrowLeft");
			await expectProfile(ui, "Default");
			const button = await point(ui, SWITCHER);
			await ui.cdp.send("Input.dispatchMouseEvent", {
				type: "mousePressed",
				x: button.x + 35,
				y: button.y,
				button: "left",
				buttons: 1,
				clickCount: 1,
			});
			await ui.cdp.send("Input.dispatchMouseEvent", {
				type: "mouseMoved",
				x: button.x - 35,
				y: button.y,
				button: "left",
				buttons: 1,
			});
			await ui.cdp.send("Input.dispatchMouseEvent", {
				type: "mouseReleased",
				x: button.x - 35,
				y: button.y,
				button: "left",
				clickCount: 1,
			});
			await expectProfile(ui, profileB);
			assert.equal(
				await ui.cdp.eval("!!document.querySelector('[role=menu]')"),
				false,
				"swiping the button opened its menu",
			);
		},
	);

	await context.step(
		"profile-wheel-repeated-reversals-under-main-thread-stalls",
		async () => {
			await selectProfile(ui, "Default");
			const target = await point(ui, `${SIDEBAR} .overflow-y-auto`);
			const timer = await ui.cdp.eval<number>(
				"setInterval(() => { const until = performance.now() + 120; while (performance.now() < until) {} }, 400)",
			);
			try {
				for (let repeat = 0; repeat < 3; repeat++) {
					await Bun.sleep(600);
					await wheel(ui, target, 80);
					await expectProfile(ui, profileB);
					await Bun.sleep(600);
					await wheel(ui, target, -80);
					await expectProfile(ui, "Default");
				}
			} finally {
				await ui.cdp.eval(`clearInterval(${timer})`);
			}
		},
	);
	await context.step(
		"profile-wheel-scrolls-real-overflowing-sidebar",
		async () => {
			await selectProfile(ui, "Default");
			await openWorkspaceList(ui);
			const scroller = `${SIDEBAR} .overflow-y-auto`;
			const overflows = () =>
				ui.cdp.eval<boolean>(
					`(() => { const e = document.querySelector(${JSON.stringify(scroller)}); return e.scrollHeight > e.clientHeight + 100; })()`,
				);
			// Populate actual groups through the UI, after testing the original sparse layout.
			for (let index = 0; index < 40 && !(await overflows()); index++) {
				await ui.wait(
					"!document.querySelector('[role=menu]') && !document.body.hasAttribute('data-scroll-locked')",
					"group menu releases page scrolling",
				);
				await nextGesture();
				await wheel(ui, await point(ui, scroller), 0, -10000);
				await ui.wait(
					`document.querySelector(${JSON.stringify(scroller)}).scrollTop === 0`,
					"project header returned to top before opening its menu",
				);
				const row = await point(
					ui,
					`${SIDEBAR} [aria-roledescription="sortable"]`,
				);
				await ui.cdp.send("Input.dispatchMouseEvent", {
					type: "mousePressed",
					...row,
					button: "right",
					clickCount: 1,
				});
				await ui.cdp.send("Input.dispatchMouseEvent", {
					type: "mouseReleased",
					...row,
					button: "right",
					clickCount: 1,
				});
				await ui.click('[role="menuitem"]', "New group");
				await ui.fill(`${SIDEBAR} input`, `E2E scroll group ${index}`);
				await ui.key("Enter");
				await ui.wait(
					`!document.querySelector('${SIDEBAR} input')`,
					"group rename completed",
				);
			}
			assert.ok(
				await overflows(),
				"real sidebar fixture must overflow before checking scroll",
			);
			await ui.wait(
				"!document.querySelector('[role=menu]') && !document.body.hasAttribute('data-scroll-locked')",
				"last group menu releases page scrolling",
			);
			await nextGesture();
			await wheel(ui, await point(ui, scroller), 0, -10000);
			await ui.wait(
				`document.querySelector(${JSON.stringify(scroller)}).scrollTop === 0`,
				"list scrolled to top",
			);
			const route = await ui.cdp.eval<string>("location.hash");
			await nextGesture();
			await wheel(ui, await point(ui, scroller), 2, 180);
			await ui.wait(
				`document.querySelector(${JSON.stringify(scroller)}).scrollTop > 0`,
				"vertical wheel scrolls real groups",
			);
			await unchanged(ui, "Default", route);
			await ui.screenshot(
				`${context.runtime.artifactDir}/profile-gesture-scrolled.png`,
			);
			await Bun.write(
				`${context.runtime.artifactDir}/profile-gesture-scroll.json`,
				JSON.stringify(
					await ui.cdp.eval(
						`(() => { const e = document.querySelector(${JSON.stringify(scroller)}); return { scrollTop: e.scrollTop, scrollHeight: e.scrollHeight, clientHeight: e.clientHeight, route: location.hash }; })()`,
					),
				),
			);
			await nextGesture();
			await wheel(ui, await point(ui, scroller), 80);
			await expectProfile(ui, profileB);
		},
	);

	await context.step(
		"profile-wheel-nested-scroller-ownership-fixture",
		async () => {
			await selectProfile(ui, "Default");
			const route = await ui.cdp.eval<string>("location.hash");
			// This is a synthetic descendant boundary check, not an actual-layout claim.
			await ui.cdp.eval(`(() => {
			const scroller = document.createElement('div');
			scroller.id = 'e2e-horizontal-wheel-owner';
			scroller.style.cssText = 'overflow-x:auto;width:160px;height:48px;flex-shrink:0';
			const content = document.createElement('div');
			content.style.cssText = 'width:600px;height:20px';
			scroller.append(content);
			document.querySelector('${SIDEBAR}').append(scroller);
		})()`);
			try {
				await nextGesture();
				await wheel(ui, await point(ui, "#e2e-horizontal-wheel-owner"), 100);
				await ui.wait(
					"document.querySelector('#e2e-horizontal-wheel-owner').scrollLeft > 0",
					"nested element consumes horizontal scroll",
				);
				await unchanged(ui, "Default", route);
				await wheel(ui, await point(ui, `${SIDEBAR} .overflow-y-auto`), 80);
				await unchanged(ui, "Default", route);
			} finally {
				await ui.cdp.eval(
					"document.querySelector('#e2e-horizontal-wheel-owner').remove()",
				);
			}
			await nextGesture();
			await wheel(ui, await point(ui, `${SIDEBAR} .overflow-y-auto`), 80);
			await expectProfile(ui, profileB);
		},
	);
}
