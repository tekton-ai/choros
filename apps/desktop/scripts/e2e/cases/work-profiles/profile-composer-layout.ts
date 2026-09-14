import assert from "node:assert/strict";
import { join } from "node:path";
import type { DesktopE2EContext } from "../../types";
import type { DesktopUi } from "../../ui";
import { openWorkspaceList, selectProfile } from "./ui";

const EDITOR = '[contenteditable="true"]';
const RESIZER = '[aria-label="Resize right edge"]';
const WARNING =
	"[...document.querySelectorAll('output')].find(e => e.textContent.includes('Your draft has been kept'))";
const DRAFT = "PROFILE_COMPOSER_LAYOUT_KEEP_DRAFT";

interface ComposerLayout {
	width: number;
	warning: { top: number; width: number; text: string };
	pickers: { bottom: number; clipped: boolean }[];
	prompt: string;
}

function measure(ui: DesktopUi) {
	return ui.cdp.eval<ComposerLayout>(`(() => {
		const composer = document.querySelector(${JSON.stringify(RESIZER)}).parentElement;
		const notice = ${WARNING};
		if (!notice) throw new Error('Profile target warning is missing');
		const device = composer.querySelector('button[aria-label^="Device:"]');
		const pickers = [...device.parentElement.querySelectorAll('button')];
		const bounds = notice.getBoundingClientRect();
		return {
			width: composer.getBoundingClientRect().width,
			warning: { top: bounds.top, width: bounds.width, text: notice.textContent },
			pickers: pickers.map(button => ({
				bottom: button.getBoundingClientRect().bottom,
				clipped: [...button.querySelectorAll('.truncate')].some(label => label.scrollWidth > label.clientWidth + 1),
			})),
			prompt: composer.querySelector(${JSON.stringify(EDITOR)}).textContent,
		};
	})()`);
}

async function resizeComposer(ui: DesktopUi, width: number) {
	const start = await ui.cdp.eval<{
		x: number;
		y: number;
		width: number;
	}>(`(() => {
		const handle = document.querySelector(${JSON.stringify(RESIZER)});
		const bounds = handle.getBoundingClientRect();
		return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, width: handle.parentElement.getBoundingClientRect().width };
	})()`);
	const target = { x: start.x + (width - start.width) / 2, y: start.y };
	await ui.cdp.send("Input.dispatchMouseEvent", {
		type: "mousePressed",
		x: start.x,
		y: start.y,
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
		await ui.wait(
			`Math.abs(document.querySelector(${JSON.stringify(RESIZER)}).parentElement.getBoundingClientRect().width - ${width}) < 1`,
			"composer resized through its actual handle",
		);
	} finally {
		await ui.cdp.send("Input.dispatchMouseEvent", {
			type: "mouseReleased",
			...target,
			button: "left",
			clickCount: 1,
		});
	}
}

export async function verifyProfileComposerLayout(
	context: DesktopE2EContext,
	ui: DesktopUi,
	profileB: string,
	projectName: string,
) {
	await context.step(
		"profile-target-warning-does-not-compress-composer-pickers",
		async () => {
			await selectProfile(ui, "Default");
			await openWorkspaceList(ui);
			await ui.click("button:has(p)", projectName);
			await ui.wait(
				"location.hash.startsWith('#/v2-workspace/')",
				"project context before creating workspace",
			);
			await ui.click("[data-dashboard-sidebar] button", "New Workspace");
			await ui.wait(
				`location.hash.startsWith('#/new-workspace') && !!document.querySelector(${JSON.stringify(EDITOR)}) && !(${WARNING})`,
				"composer opens with its valid project selected",
			);
			const originalWidth = await ui.cdp.eval<number>(
				`document.querySelector(${JSON.stringify(RESIZER)}).parentElement.getBoundingClientRect().width`,
			);
			assert.equal(
				originalWidth,
				592,
				"default composer width must remain unchanged",
			);
			await ui.click(EDITOR);
			await ui.key("a", "KeyA", process.platform === "darwin" ? 4 : 2);
			await ui.cdp.send("Input.insertText", { text: DRAFT });
			await ui.wait(
				`document.querySelector(${JSON.stringify(EDITOR)}).textContent === ${JSON.stringify(DRAFT)}`,
				"draft entered through the editor",
			);
			await selectProfile(ui, profileB);
			await ui.wait(
				`!!(${WARNING})`,
				"switching away from the selected project asks for a new target",
			);
			const measurements: ComposerLayout[] = [];
			try {
				for (const width of [originalWidth, 520]) {
					await resizeComposer(ui, width);
					const layout = await measure(ui);
					assert.equal(
						layout.width,
						width,
						"warning must not widen the composer",
					);
					assert.ok(
						layout.pickers.length >= 2,
						"device and project controls must stay available",
					);
					assert.ok(
						layout.warning.top >=
							Math.max(...layout.pickers.map((picker) => picker.bottom)),
						"warning must appear below, not inside, the picker row",
					);
					assert.ok(
						Math.abs(layout.warning.width - layout.width) < 1,
						"warning has the composer width available for wrapping",
					);
					assert.ok(
						layout.pickers.every((picker) => !picker.clipped),
						"short picker labels must not be squeezed by the warning",
					);
					assert.equal(
						layout.prompt,
						DRAFT,
						"layout and Profile changes preserve the draft",
					);
					measurements.push(layout);
					await ui.screenshot(
						join(
							context.runtime.artifactDir,
							`profile-composer-warning-${width}.png`,
						),
					);
				}
				await ui.click("button", "Select project");
				await ui.click('[role="option"]', "No project");
				await ui.wait(
					`!(${WARNING})`,
					"explicit No project choice clears the warning",
				);
				assert.equal(
					await ui.cdp.eval(
						`document.querySelector(${JSON.stringify(EDITOR)}).textContent`,
					),
					DRAFT,
				);
				await Bun.write(
					join(context.runtime.artifactDir, "profile-composer-layout.json"),
					JSON.stringify(measurements, null, 2),
				);
			} finally {
				await resizeComposer(ui, originalWidth);
				await openWorkspaceList(ui);
				await selectProfile(ui, "Default");
			}
		},
	);
}
