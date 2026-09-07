import type {
	DashboardSidebarPinnedWorkspace,
	DashboardSidebarProject,
	DashboardSidebarSessions,
	DashboardSidebarWorkspace,
} from "../../types";
import { getProjectChildrenWorkspaces } from "../../utils/project-children";

interface RawSidebarData {
	groups: DashboardSidebarProject[];
	pinnedWorkspaces: DashboardSidebarPinnedWorkspace[];
	sessions: DashboardSidebarSessions;
}

export function projectDashboardSidebar({
	groups,
	pinnedWorkspaces,
	sessions,
	isProjectVisible,
	isWorkspaceVisible,
}: RawSidebarData & {
	isProjectVisible: (projectId: string) => boolean;
	isWorkspaceVisible: (workspace: DashboardSidebarWorkspace) => boolean;
}) {
	return {
		groups: groups.filter((project) => isProjectVisible(project.id)),
		pinnedWorkspaces: pinnedWorkspaces.filter(isWorkspaceVisible),
		sessionWorkspaces: sessions.orderedWorkspaces.filter(isWorkspaceVisible),
		sessionTagGroups: sessions.tagGroups.flatMap((group) => {
			const workspaces = group.workspaces.filter(isWorkspaceVisible);
			return workspaces.length > 0 ? [{ ...group, workspaces }] : [];
		}),
		ungroupedSessionWorkspaces:
			sessions.ungroupedWorkspaces.filter(isWorkspaceVisible),
	};
}

/** Keep the original render eligibility as the background status input. */
export function getDashboardSidebarStatusWorkspaces({
	groups,
	pinnedWorkspaces,
	sessions,
}: RawSidebarData) {
	const statusById = new Map<string, { id: string; hostId: string }>();
	const addStatus = (workspace: DashboardSidebarWorkspace) => {
		statusById.set(workspace.id, {
			id: workspace.id,
			hostId: workspace.hostId,
		});
	};
	for (const workspace of pinnedWorkspaces) addStatus(workspace);
	for (const workspace of sessions.orderedWorkspaces) addStatus(workspace);
	for (const project of groups) {
		for (const workspace of getProjectChildrenWorkspaces(project.children)) {
			addStatus(workspace);
		}
	}
	return [...statusById.values()];
}
