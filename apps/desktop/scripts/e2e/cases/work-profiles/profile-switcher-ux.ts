import assert from "node:assert/strict";
import { join } from "node:path";
import type { DesktopE2EContext } from "../../types";
import type { DesktopUi } from "../../ui";
import { openWorkspaceList, selectProfile } from "./ui";

const SIDEBAR = "[data-dashboard-sidebar]";
const SWITCHER = 'button[aria-label^="Work Profile:"]';
const NAME = "[data-profile-name]";
const POSITION = "[data-profile-position]";
const NAVIGATION = "[data-profile-navigation]";
const PREVIOUS = `${NAVIGATION} button[aria-label^="Previous Profile"]`;
const NEXT = `${NAVIGATION} button[aria-label^="Next Profile"]`;
const SEPARATOR = '[role="separator"][aria-orientation="vertical"]';
const SEARCH = 'input[placeholder^="Search workspaces"]';
// Created by verifyProfileGestures; this helper must not add another Profile.
const PROFILE_C = "E2E Gesture C";

async function point(ui: DesktopUi, selector: string) {
	return ui.cdp.eval<{ x: number; y: number }>(`(() => {
		const element = document.querySelector(${JSON.stringify(selector)});
		if (!element) throw new Error('Missing Profile UX target: ' + ${JSON.stringify(selector)});
		const rect = element.getBoundingClientRect();
		if (!rect.width || !rect.height) throw new Error('Hidden Profile UX target');
		return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
	})()`);
}

async function hover(ui: DesktopUi, selector: string) {
	await ui.cdp.send("Input.dispatchMouseEvent", {
		type: "mouseMoved",
		...(await point(ui, selector)),
	});
}

async function resizeTo(ui: DesktopUi, width: number) {
	const handle = await point(ui, SEPARATOR);
	const currentWidth = await sidebarWidth(ui);
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
}

function sidebarWidth(ui: DesktopUi) {
	return ui.cdp.eval<number>(
		`Number(document.querySelector(${JSON.stringify(SEPARATOR)}).getAttribute('aria-valuenow'))`,
	);
}

function settle(ui: DesktopUi) {
	return ui.cdp.eval(
		"new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
	);
}

async function expectCurrent(
	ui: DesktopUi,
	name: string,
	position: number,
	collapsed = false,
) {
	const visibleName = collapsed ? Array.from(name)[0] : name;
	const visiblePosition = `${collapsed ? "" : "Profile "}${position}/3`;
	await ui.wait(
		`document.querySelector(${JSON.stringify(SWITCHER)})?.getAttribute('aria-label')?.startsWith(${JSON.stringify(`Work Profile: ${name}.`)}) && document.querySelector('${NAME}')?.textContent.trim() === ${JSON.stringify(visibleName)} && document.querySelector('${POSITION}')?.textContent.trim() === ${JSON.stringify(visiblePosition)} && document.querySelector('${POSITION}')?.getBoundingClientRect().width > 0`,
		`Profile name and position show ${name}, ${visiblePosition}`,
	);
}

function tooltipWith(...parts: string[]) {
	return `[...document.querySelectorAll('[role="tooltip"]')].some(e => {
		const content = e.closest('[data-slot="tooltip-content"]') ?? e;
		const style = getComputedStyle(content);
		return content.getBoundingClientRect().width > 0
			&& style.visibility === 'visible' && Number(style.opacity) > 0
			&& ${parts.map((part) => `e.textContent.includes(${JSON.stringify(part)})`).join(" && ")};
	})`;
}

async function expectDestination(
	ui: DesktopUi,
	selector: string,
	name: string,
) {
	await ui.wait(
		`document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-label')?.includes(${JSON.stringify(name)}) && document.querySelector(${JSON.stringify(selector)})?.disabled === false`,
		`navigation names destination ${name}`,
	);
	await hover(ui, selector);
	await ui.wait(tooltipWith(name), `destination tooltip names ${name}`);
}

async function expectBoundaryUnchanged(
	ui: DesktopUi,
	selector: string,
	name: string,
	position: number,
	route: string,
) {
	assert.equal(
		await ui.cdp.eval<boolean>(
			`document.querySelector(${JSON.stringify(selector)}).disabled`,
		),
		true,
		"boundary navigation must be natively disabled",
	);
	// DesktopUi.click intentionally refuses disabled controls. Dispatch native
	// pointer input at its real bounds to prove it cannot wrap or navigate.
	const target = await point(ui, selector);
	for (const type of ["mousePressed", "mouseReleased"]) {
		await ui.cdp.send("Input.dispatchMouseEvent", {
			type,
			...target,
			button: "left",
			clickCount: 1,
		});
	}
	await Bun.sleep(250);
	await expectCurrent(ui, name, position);
	assert.equal(await ui.cdp.eval("location.hash"), route);
}

export async function verifySingleProfileSwitcher(ui: DesktopUi) {
	await ui.wait(
		`document.querySelector('${NAME}')?.textContent.trim() === 'Default'`,
		"single Profile name remains visible",
	);
	assert.equal(
		await ui.cdp.eval(
			`!!document.querySelector('${NAVIGATION}') || /two fingers/i.test(document.querySelector('[data-profile-switcher]').textContent)`,
		),
		false,
		"a single Profile must not offer swipe or previous/next navigation",
	);
}

interface NameFrame {
	opacity: number;
	x: number;
	durations: number[];
}

async function observeNameSwitch(
	ui: DesktopUi,
	name: string,
	navigate: () => Promise<void>,
) {
	// Sample the actual rendered name across native input, without replacing
	// animate(), timers, the component, or any Profile/store implementation.
	const observations = ui.cdp.eval<
		NameFrame[]
	>(`new Promise((resolve, reject) => {
		const started = performance.now();
		let switchedAt;
		const frames = [];
		function sample(now) {
			const element = document.querySelector('${NAME}');
			if (element?.textContent.trim() === ${JSON.stringify(name)}) {
				switchedAt ??= now;
				const style = getComputedStyle(element);
				frames.push({
					opacity: Number(style.opacity),
					x: new DOMMatrixReadOnly(style.transform).m41,
					durations: element.getAnimations().map(animation => Number(animation.effect.getComputedTiming().duration)),
				});
				if (now - switchedAt >= 350) return resolve(frames);
			}
			if (now - started > 5000) return reject(new Error('Profile name did not settle: ' + ${JSON.stringify(name)}));
			requestAnimationFrame(sample);
		}
		requestAnimationFrame(sample);
	})`);
	const [frames] = await Promise.all([observations, navigate()]);
	return frames;
}

export async function verifyProfileSwitcherUx(
	context: DesktopE2EContext,
	ui: DesktopUi,
	profileB: string,
) {
	await context.step(
		"profile-switcher-position-destinations-and-boundaries",
		async () => {
			await selectProfile(ui, "Default");
			await openWorkspaceList(ui);
			const route = await ui.cdp.eval<string>("location.hash");
			await expectCurrent(ui, "Default", 1);
			await ui.wait(
				`document.querySelector('${NAVIGATION}')?.getBoundingClientRect().height > 0 && /two fingers/i.test(document.querySelector('${NAVIGATION}').textContent)`,
				"expanded switcher visibly explains two-finger switching",
			);
			await expectBoundaryUnchanged(ui, PREVIOUS, "Default", 1, route);
			await expectDestination(ui, NEXT, profileB);
			await ui.screenshot(
				join(context.runtime.artifactDir, "profile-switcher-first.png"),
			);
			await ui.click(NEXT);
			await expectCurrent(ui, profileB, 2);
			assert.equal(
				await ui.cdp.eval("location.hash"),
				route,
				"list switching stays on the list",
			);
			await expectDestination(ui, PREVIOUS, "Default");
			await expectDestination(ui, NEXT, PROFILE_C);
			await ui.screenshot(
				join(context.runtime.artifactDir, "profile-switcher-middle.png"),
			);
			await ui.click(NEXT);
			await expectCurrent(ui, PROFILE_C, 3);
			await expectBoundaryUnchanged(ui, NEXT, PROFILE_C, 3, route);
			await expectDestination(ui, PREVIOUS, profileB);
			await ui.click(PREVIOUS);
			await expectCurrent(ui, profileB, 2);
			await ui.click(SWITCHER);
			await ui.wait(
				`document.querySelector('[role="menuitemradio"][title=${JSON.stringify(profileB)}]')?.getAttribute('aria-checked') === 'true'`,
				"dropdown still identifies the Profile selected by arrows",
			);
			await ui.screenshot(
				join(context.runtime.artifactDir, "profile-switcher-dropdown.png"),
			);
			await ui.click('[role="menuitemradio"][title="Default"]');
			await ui.wait(
				"!document.querySelector('[role=menu]')",
				"Profile dropdown dismisses after selection",
			);
			await expectCurrent(ui, "Default", 1);
			assert.equal(await ui.cdp.eval("location.hash"), route);
		},
	);

	await context.step(
		"profile-switcher-directional-name-and-reduced-motion",
		async () => {
			await selectProfile(ui, "Default");
			await openWorkspaceList(ui);
			try {
				await ui.cdp.send("Emulation.setEmulatedMedia", {
					features: [
						{ name: "prefers-reduced-motion", value: "no-preference" },
					],
				});
				await settle(ui);
				const forward = await observeNameSwitch(ui, profileB, () =>
					ui.click(NEXT),
				);
				await expectCurrent(ui, profileB, 2);
				const backward = await observeNameSwitch(ui, "Default", () =>
					ui.click(PREVIOUS),
				);
				await expectCurrent(ui, "Default", 1);
				for (const frames of [forward, backward]) {
					assert.ok(
						frames.some((frame) =>
							frame.durations.some(
								(duration) => duration > 0 && duration <= 250,
							),
						),
						"ordinary switching shows a short name animation",
					);
					assert.ok(
						frames.some((frame) => Math.abs(frame.x) > 0.01),
						"name visibly moves while switching",
					);
					const last = frames[frames.length - 1];
					assert.ok(
						last && Math.abs(last.x) < 0.01 && last.opacity === 1,
						"name settles fully visible in its original position",
					);
				}
				const forwardMotion = forward.find((frame) => Math.abs(frame.x) > 0.01);
				const backwardMotion = backward.find(
					(frame) => Math.abs(frame.x) > 0.01,
				);
				assert.ok(
					forwardMotion &&
						backwardMotion &&
						forwardMotion.x * backwardMotion.x < 0,
					"previous and next move the name in opposite directions",
				);

				await ui.cdp.send("Emulation.setEmulatedMedia", {
					features: [{ name: "prefers-reduced-motion", value: "reduce" }],
				});
				await ui.wait(
					"matchMedia('(prefers-reduced-motion: reduce)').matches",
					"reduced-motion media preference applied",
				);
				await settle(ui);
				const reduced = await observeNameSwitch(ui, profileB, () =>
					ui.click(NEXT),
				);
				await expectCurrent(ui, profileB, 2);
				assert.ok(
					reduced.every(
						(frame) =>
							frame.durations.length === 0 &&
							Math.abs(frame.x) < 0.01 &&
							frame.opacity === 1,
					),
					"reduced motion changes the name without an animation or visual displacement",
				);
				await ui.screenshot(
					join(
						context.runtime.artifactDir,
						"profile-switcher-reduced-motion.png",
					),
				);
				await Bun.write(
					join(context.runtime.artifactDir, "profile-switcher-motion.json"),
					JSON.stringify({ forward, backward, reduced }),
				);
			} finally {
				await ui.cdp.send("Emulation.setEmulatedMedia", { features: [] });
				await selectProfile(ui, "Default");
			}
		},
	);

	await context.step(
		"profile-switcher-collapsed-feedback-preserves-focus",
		async () => {
			await selectProfile(ui, "Default");
			await openWorkspaceList(ui);
			const route = await ui.cdp.eval<string>("location.hash");
			const initialWidth = await sidebarWidth(ui);
			try {
				await resizeTo(ui, 52);
				await ui.wait(
					`document.querySelector('${SIDEBAR}').getBoundingClientRect().width < 100`,
					"sidebar collapsed through its resize handle",
				);
				await expectCurrent(ui, "Default", 1, true);
				assert.equal(
					await ui.cdp.eval(`!!document.querySelector('${NAVIGATION}')`),
					false,
					"collapsed rail hides the hint and arrows",
				);
				await ui.click(SEARCH);
				await hover(ui, `${SIDEBAR} .overflow-y-auto`);
				await Bun.sleep(300);
				await ui.cdp.send("Input.dispatchMouseEvent", {
					type: "mouseWheel",
					...(await point(ui, `${SIDEBAR} .overflow-y-auto`)),
					deltaX: 80,
					deltaY: 0,
				});
				await expectCurrent(ui, profileB, 2, true);
				await ui.wait(
					tooltipWith(profileB, "Profile 2/3"),
					"collapsed switching reveals full name and position",
					1000,
				);
				assert.equal(
					await ui.cdp.eval(
						`document.activeElement?.matches(${JSON.stringify(SEARCH)})`,
					),
					true,
					"automatic feedback must not steal focus from workspace search",
				);
				assert.equal(
					await ui.cdp.eval("location.hash"),
					route,
					"collapsed switching preserves the list route",
				);
				await ui.screenshot(
					join(
						context.runtime.artifactDir,
						"profile-switcher-collapsed-feedback.png",
					),
				);
				await ui.wait(
					`!(${tooltipWith(profileB, "Profile 2/3")})`,
					"automatic collapsed feedback dismisses without input",
					3000,
				);
				assert.equal(
					await ui.cdp.eval(
						`document.activeElement?.matches(${JSON.stringify(SEARCH)})`,
					),
					true,
					"feedback dismissal must not move focus",
				);

				await ui.click(SWITCHER);
				await ui.key("Escape");
				await ui.wait(
					`!document.querySelector('[role=menu]') && document.activeElement === document.querySelector(${JSON.stringify(SWITCHER)})`,
					"collapsed dropdown restores trigger focus",
				);
				await hover(ui, SEARCH);
				await hover(ui, SWITCHER);
				await ui.wait(
					tooltipWith(profileB, "Profile 2/3"),
					"hover still reveals collapsed full name",
				);
				await ui.key("ArrowRight");
				await expectCurrent(ui, PROFILE_C, 3, true);
				await ui.wait(
					tooltipWith(PROFILE_C, "Profile 3/3"),
					"hovered feedback follows keyboard switching",
				);
				await Bun.sleep(1500);
				assert.equal(
					await ui.cdp.eval(tooltipWith(PROFILE_C, "Profile 3/3")),
					true,
					"hover keeps the full name visible after transient feedback expires",
				);
				assert.equal(
					await ui.cdp.eval(
						`document.activeElement === document.querySelector(${JSON.stringify(SWITCHER)})`,
					),
					true,
					"keyboard switching keeps trigger focus",
				);
				await ui.screenshot(
					join(
						context.runtime.artifactDir,
						"profile-switcher-collapsed-hover.png",
					),
				);
			} finally {
				await hover(ui, SEARCH);
				await resizeTo(ui, initialWidth);
				await ui.wait(
					`document.querySelector('${SIDEBAR}').getBoundingClientRect().width > 100`,
					"sidebar width restored",
				);
				await selectProfile(ui, "Default");
			}
		},
	);
}
