import type { WorkspaceStore } from "@choros/panes";
import { useLocation } from "@tanstack/react-router";
import { useEffect, useLayoutEffect } from "react";
import { resolveTerminalTarget } from "renderer/routes/_authenticated/components/v2-notification-controller/lib/resolve-v2-notification-target";
import { useProfiles } from "renderer/routes/_authenticated/providers/profile-provider";
import { getV2NotificationSourcesForPane } from "renderer/stores/v2-notifications";
import type { StoreApi } from "zustand/vanilla";
import { useWorkspace } from "../../../providers/workspace-provider";
import { useWorkspaceHostReady } from "../../../providers/workspace-provider/components/workspace-host-gate/workspace-host-gate";
import type { PaneViewerData } from "../../types";

export function useProfileWorkspaceOpened({
	store,
	isLayoutReady,
	isWorkspaceReady,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	isLayoutReady: boolean;
	isWorkspaceReady: boolean;
}) {
	const { workspace } = useWorkspace();
	const hostReady = useWorkspaceHostReady();
	const openKey = useLocation({
		select: (location) => location.state.__TSR_key ?? location.href,
	});
	const {
		generation,
		recordOpenedWorkspace,
		isWorkspaceNavigationCurrent,
		focusRequest,
		consumeFocusRequest,
	} = useProfiles();
	const ready =
		isLayoutReady &&
		isWorkspaceReady &&
		hostReady &&
		workspace.worktreeExists &&
		workspace.archivedAt == null;

	useEffect(() => {
		if (!ready) return;
		recordOpenedWorkspace(workspace, `${openKey}:${generation}`);
	}, [ready, recordOpenedWorkspace, workspace, openKey, generation]);

	useLayoutEffect(() => {
		if (
			!ready ||
			!focusRequest ||
			focusRequest.workspaceId !== workspace.id ||
			focusRequest.generation !== generation ||
			!isWorkspaceNavigationCurrent(workspace)
		)
			return;
		const state = store.getState();
		const source = focusRequest.source;
		let target: { tabId?: string; paneId?: string } | null = null;
		if (source.type === "terminal") {
			target = resolveTerminalTarget({
				workspaceId: workspace.id,
				terminalId: source.id,
				paneLayout: state,
			});
		} else {
			for (const tab of state.tabs) {
				const pane = Object.values(tab.panes).find((pane) =>
					getV2NotificationSourcesForPane(pane).some(
						(candidate) =>
							candidate.type === source.type && candidate.id === source.id,
					),
				);
				if (pane) {
					target = { tabId: tab.id, paneId: pane.id };
					break;
				}
			}
		}
		if (target?.tabId && target.paneId) {
			state.setActiveTab(target.tabId);
			state.setActivePane({ tabId: target.tabId, paneId: target.paneId });
		}
		// The existing resolver's terminal-only fallback opens the workspace
		// without inventing a pane or creating/restarting a terminal session.
		consumeFocusRequest(focusRequest.generation);
	}, [
		ready,
		focusRequest,
		generation,
		workspace,
		store,
		isWorkspaceNavigationCurrent,
		consumeFocusRequest,
	]);
	return (
		ready && isWorkspaceNavigationCurrent(workspace) && focusRequest === null
	);
}
