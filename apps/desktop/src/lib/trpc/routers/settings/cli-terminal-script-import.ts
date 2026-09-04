import type { TerminalPreset } from "@choros/local-db";

export function isPendingCliTerminalScript(script: TerminalPreset): boolean {
	return script.cliImportPending === true;
}

export function clearImportedCliTerminalScripts({
	scripts,
	ids,
}: {
	scripts: TerminalPreset[];
	ids: readonly string[];
}): { scripts: TerminalPreset[]; changed: boolean } {
	const acknowledgedIds = new Set(ids);
	let changed = false;
	const nextScripts = scripts.map((script) => {
		if (
			!acknowledgedIds.has(script.id) ||
			!isPendingCliTerminalScript(script)
		) {
			return script;
		}
		changed = true;
		const { cliImportPending: _pending, ...rest } = script;
		return rest;
	});
	return { scripts: nextScripts, changed };
}
