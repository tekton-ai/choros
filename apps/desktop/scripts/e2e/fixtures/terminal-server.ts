import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { type DesktopE2ERuntime, eventually } from "../runtime";
import type { DesktopUi } from "../ui";

const portMarkerSchema = z.object({
	port: z.number().int().min(1).max(65535),
	pid: z.number().int().positive(),
	label: z.string(),
});

function shellQuote(value: string) {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

export async function startTerminalServer(
	ui: DesktopUi,
	runtime: DesktopE2ERuntime,
	workspaceId: string,
	label: string,
) {
	await ui.button("Open Terminal");
	await ui.terminalReady(workspaceId);
	await ui.click(".xterm-screen");
	await ui.wait(
		"document.activeElement?.classList.contains('xterm-helper-textarea')",
		"real terminal focus",
	);
	const markerPath = join(runtime.artifactDir, `${label}.json`);
	const fixture = join(
		runtime.desktopDir,
		"scripts/e2e/fixtures/port-server.ts",
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
