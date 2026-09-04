import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import type { SessionMetrics } from "../../types";

interface UseResourceNavigationOptions {
	surface: "v2";
	onNavigate: () => void;
}

export function useResourceNavigation({
	onNavigate,
}: UseResourceNavigationOptions) {
	const navigate = useNavigate();
	const getPaneName = useCallback(
		(session: SessionMetrics): string =>
			session.title ?? `Terminal ${session.sessionId.slice(0, 8)}`,
		[],
	);
	const navigateToWorkspace = useCallback(
		(workspaceId: string) => {
			void navigateToV2Workspace(workspaceId, navigate);
			onNavigate();
		},
		[navigate, onNavigate],
	);
	const navigateToPane = (_workspaceId: string, _paneId: string) =>
		navigateToWorkspace(_workspaceId);
	return { getPaneName, navigateToWorkspace, navigateToPane };
}
