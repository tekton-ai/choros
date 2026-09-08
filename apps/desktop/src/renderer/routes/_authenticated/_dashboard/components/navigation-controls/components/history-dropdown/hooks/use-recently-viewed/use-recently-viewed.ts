import { useMemo } from "react";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/host-workspaces-provider";
import { useProfiles } from "renderer/routes/_authenticated/providers/profile-provider";
import { getRecentProfileWorkspaces } from "renderer/routes/_authenticated/providers/profile-provider/utils/profile-projection/profile-projection";

export interface RecentlyViewedEntry {
	path: string;
	type: "v2-workspace";
	entityId: string;
	hostId: string;
}

export function useRecentlyViewed(limit = 20): RecentlyViewedEntry[] {
	const { workspaces } = useHostWorkspaces();
	const { visits, activeProfileId, getWorkspaceProfileId } = useProfiles();
	return useMemo(
		() =>
			getRecentProfileWorkspaces({
				visits,
				workspaces,
				profileId: activeProfileId,
				getWorkspaceProfileId,
				limit,
			}).map(({ workspace }) => ({
				path: `/v2-workspace/${encodeURIComponent(workspace.id)}`,
				type: "v2-workspace" as const,
				entityId: workspace.id,
				hostId: workspace.hostId,
			})),
		[visits, workspaces, activeProfileId, getWorkspaceProfileId, limit],
	);
}
