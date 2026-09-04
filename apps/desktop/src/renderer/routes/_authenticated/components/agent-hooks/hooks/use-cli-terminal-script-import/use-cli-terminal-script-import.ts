import { useEffect } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/collections-provider";
import { getNextTabOrder } from "renderer/routes/_authenticated/providers/collections-provider/dashboard-sidebar-local";

export function useCliTerminalScriptImport(): void {
	const collections = useCollections();
	const utils = electronTrpc.useUtils();
	const pending = electronTrpc.settings.getPendingCliTerminalScripts.useQuery();
	const acknowledge =
		electronTrpc.settings.acknowledgeCliTerminalScripts.useMutation({
			onSuccess: () => utils.settings.getPendingCliTerminalScripts.invalidate(),
		});

	useEffect(() => {
		const scripts = pending.data ?? [];
		if (scripts.length === 0) return;
		const presets = [...collections.v2TerminalPresets.state.values()];
		const existingIds = new Set(presets.map((preset) => preset.id));
		let tabOrder = getNextTabOrder(presets);
		const importedIds: string[] = [];
		for (const script of scripts) {
			if (!existingIds.has(script.id)) {
				collections.v2TerminalPresets.insert({
					id: script.id,
					name: script.name,
					description: script.description,
					cwd: script.cwd,
					commands: script.commands,
					projectIds: script.projectIds ?? null,
					pinnedToBar: script.pinnedToBar,
					useAsWorkspaceRun: script.useAsWorkspaceRun,
					applyOnWorkspaceCreated: script.applyOnWorkspaceCreated,
					applyOnNewTab: script.applyOnNewTab,
					executionMode: script.executionMode ?? "new-tab",
					tabOrder: tabOrder++,
					createdAt: new Date(),
					agentId: undefined,
				});
			}
			importedIds.push(script.id);
		}
		if (importedIds.length > 0) acknowledge.mutate({ ids: importedIds });
	}, [acknowledge, collections.v2TerminalPresets, pending.data]);
}
