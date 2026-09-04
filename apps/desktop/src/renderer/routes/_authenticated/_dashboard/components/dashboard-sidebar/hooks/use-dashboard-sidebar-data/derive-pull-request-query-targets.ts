import type { DashboardSidebarWorkspaceHostType } from "../../types";

export interface PullRequestQueryTarget {
	machineId: string;
	hostType: DashboardSidebarWorkspaceHostType;
	hostUrl: string | null;
	workspaceIds: string[];
}

export const DASHBOARD_SIDEBAR_PULL_REQUEST_QUERY_KEY_PREFIX = [
	"host-service",
	"pull-requests",
	"by-workspaces",
] as const;

export function getDashboardSidebarPullRequestQueryKey(
	target: PullRequestQueryTarget,
) {
	return [
		...DASHBOARD_SIDEBAR_PULL_REQUEST_QUERY_KEY_PREFIX,
		target.machineId,
	] as const;
}
