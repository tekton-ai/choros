import { useNavigate } from "@tanstack/react-router";
import { useV2UserPreferences } from "renderer/hooks/use-v2-user-preferences";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import type { LinkAction } from "renderer/routes/_authenticated/providers/collections-provider/dashboard-sidebar-local/schema";
import type { DashboardSidebarPort } from "../use-dashboard-sidebar-ports-data";

interface UsePortOpenActionsResult {
	canOpenInBrowser: boolean;
	portUrl: string;
	isOpenExternalPending: boolean;
	portOpenAction: LinkAction;
	openExternal: () => void;
	openInApp: (target: "new-tab" | "current-tab") => void;
	openInBrowser: () => void;
	openWorkspace: () => void;
	openPrimary: () => void;
}

export function usePortOpenActions(
	port: DashboardSidebarPort,
): UsePortOpenActionsResult {
	const navigate = useNavigate();
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const { preferences } = useV2UserPreferences();
	const canOpenInBrowser = true;
	const portUrl = `http://localhost:${port.port}`;

	const openExternal = () => {
		if (!canOpenInBrowser || openUrl.isPending) return;
		openUrl.mutate(portUrl);
	};

	const openInApp = (target: "new-tab" | "current-tab") => {
		if (!canOpenInBrowser) return;
		void navigateToV2Workspace(port.workspaceId, navigate, {
			search: {
				openUrl: portUrl,
				openUrlTarget: target,
				openUrlRequestId: crypto.randomUUID(),
			},
		});
	};

	// Where a plain click opens the port is configurable under
	// Settings → Links → Ports.
	const openInBrowser = () => {
		if (preferences.portOpenAction === "external") {
			openExternal();
			return;
		}
		openInApp(
			preferences.portOpenAction === "newTab" ? "new-tab" : "current-tab",
		);
	};

	const openWorkspace = () => {
		void navigateToV2Workspace(port.workspaceId, navigate);
	};

	const openPrimary = openInBrowser;

	return {
		canOpenInBrowser,
		portUrl,
		isOpenExternalPending: openUrl.isPending,
		portOpenAction: preferences.portOpenAction,
		openExternal,
		openInApp,
		openInBrowser,
		openWorkspace,
		openPrimary,
	};
}
