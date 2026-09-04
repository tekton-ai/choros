import { describe, expect, test } from "bun:test";
import type { TerminalPreset } from "@choros/local-db";
import { clearImportedCliTerminalScripts } from "./cli-terminal-script-import";

const pendingScript = (
	overrides: Partial<TerminalPreset> = {},
): TerminalPreset => ({
	id: "script-a",
	name: "Script A",
	cwd: "",
	commands: ["echo a"],
	cliImportPending: true,
	...overrides,
});

describe("clearImportedCliTerminalScripts", () => {
	test("keeps the source row but drops the one-shot import marker", () => {
		const regular = pendingScript({
			id: "regular",
			cliImportPending: undefined,
		});
		const result = clearImportedCliTerminalScripts({
			scripts: [pendingScript(), regular],
			ids: ["script-a"],
		});

		expect(result.changed).toBe(true);
		expect(result.scripts).toEqual([
			{ id: "script-a", name: "Script A", cwd: "", commands: ["echo a"] },
			regular,
		]);
	});

	test("ignores ids that are not pending", () => {
		const script = pendingScript({ cliImportPending: undefined });
		const result = clearImportedCliTerminalScripts({
			scripts: [script],
			ids: [script.id],
		});

		expect(result).toEqual({ scripts: [script], changed: false });
	});
});
