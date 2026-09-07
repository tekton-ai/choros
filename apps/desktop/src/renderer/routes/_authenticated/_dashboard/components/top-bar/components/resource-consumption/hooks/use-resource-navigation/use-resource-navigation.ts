import { useCallback } from "react";
import { useProfiles } from "renderer/routes/_authenticated/providers/profile-provider";
import type { SessionMetrics } from "../../types";

interface UseResourceNavigationOptions {
	surface: "v2";
	onNavigate: () => void;
}

export function useResourceNavigation({
	onNavigate,
}: UseResourceNavigationOptions) {
	const { openWorkspace } = useProfiles();
	const getPaneName = useCallback(
		(session: SessionMetrics): string =>
			session.title ?? `Terminal ${session.sessionId.slice(0, 8)}`,
		[],
	);
	const navigateToWorkspace = useCallback(
		(workspaceId: string) => {
			void openWorkspace(workspaceId);
			onNavigate();
		},
		[openWorkspace, onNavigate],
	);
	const navigateToPane = (_workspaceId: string, _paneId: string) =>
		navigateToWorkspace(_workspaceId);
	return { getPaneName, navigateToWorkspace, navigateToPane };
}
