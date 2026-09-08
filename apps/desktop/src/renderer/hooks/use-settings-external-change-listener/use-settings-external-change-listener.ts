import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { FONT_SETTINGS_QUERY_KEY } from "renderer/lib/font-settings";
import { useInlineWorkspacePortsStore } from "renderer/stores/inline-workspace-ports";
import { syncPersistedStoreAcrossWindows } from "renderer/stores/sync-persisted-store-across-windows";
import { useThemeStore } from "renderer/stores/theme";
import { useWorkspaceAgentsRowStore } from "renderer/stores/workspace-agents-row";
import { NOTIFICATION_EVENTS } from "shared/constants";
import type { Theme } from "shared/themes";

interface ExternalThemeState {
	activeThemeId: string;
	customThemes: Theme[];
	systemLightThemeId?: string;
	systemDarkThemeId?: string;
}

function isExternalThemeState(value: unknown): value is ExternalThemeState {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as ExternalThemeState).activeThemeId === "string"
	);
}

/**
 * Applies global settings changes from other windows and the `choros settings`
 * CLI. This authenticated-level hook also stays mounted on Settings routes,
 * where the dashboard's storage listeners are not available.
 */
export function useSettingsExternalChangeListener() {
	const utils = electronTrpc.useUtils();
	const queryClient = useQueryClient();

	useEffect(() => {
		const stopPortsSync = syncPersistedStoreAcrossWindows(
			useInlineWorkspacePortsStore,
		);
		const stopAgentsSync = syncPersistedStoreAcrossWindows(
			useWorkspaceAgentsRowStore,
		);
		return () => {
			stopPortsSync();
			stopAgentsSync();
		};
	}, []);

	electronTrpc.notifications.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (event.type !== NOTIFICATION_EVENTS.SETTINGS_EXTERNAL_CHANGE) return;
			const themeState = event.data?.themeState;
			if (isExternalThemeState(themeState)) {
				useThemeStore.getState().applyExternalThemeState(themeState);
			}
			void utils.settings.invalidate();
			// terminal + editor panes read typography through this custom key,
			// not the tRPC key space, so invalidate it explicitly
			void queryClient.invalidateQueries({ queryKey: FONT_SETTINGS_QUERY_KEY });
		},
	});
}
