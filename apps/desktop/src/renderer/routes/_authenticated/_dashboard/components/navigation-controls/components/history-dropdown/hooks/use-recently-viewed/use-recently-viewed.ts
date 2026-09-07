import { useLocation } from "@tanstack/react-router";
import { useMemo } from "react";
import { persistentHistory } from "renderer/lib/persistent-hash-history";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/host-workspaces-provider";
import { useProfiles } from "renderer/routes/_authenticated/providers/profile-provider";
import {
	getRecentProfileWorkspaces,
	type ProfileWorkspaceIdentity,
} from "renderer/routes/_authenticated/providers/profile-provider/utils/profile-projection/profile-projection";
import { getRecentHistoryWorkspaces } from "./use-recently-viewed.utils";

export interface RecentlyViewedEntry {
	path: string;
	type: "v2-workspace";
	entityId: string;
	hostId: string;
}

function toRecentlyViewedEntry(
	workspace: ProfileWorkspaceIdentity,
): RecentlyViewedEntry {
	return {
		path: `/v2-workspace/${encodeURIComponent(workspace.id)}`,
		type: "v2-workspace",
		entityId: workspace.id,
		hostId: workspace.hostId,
	};
}

export function useRecentlyViewed(limit = 20): RecentlyViewedEntry[] {
	// Refresh path history on navigation, including search and nested route changes.
	const location = useLocation();
	const { workspaces } = useHostWorkspaces();
	const { enabled, visits, activeProfileId, getWorkspaceProfileId } =
		useProfiles();
	// biome-ignore lint/correctness/useExhaustiveDependencies: router commits invalidate the external persistent-history snapshot
	return useMemo(
		() =>
			enabled
				? getRecentProfileWorkspaces({
						visits,
						workspaces,
						profileId: activeProfileId,
						getWorkspaceProfileId,
						limit,
					}).map(({ workspace }) => toRecentlyViewedEntry(workspace))
				: getRecentHistoryWorkspaces({
						entries: persistentHistory.getEntries(),
						workspaces,
						limit,
					}).map(toRecentlyViewedEntry),
		[
			enabled,
			location,
			visits,
			workspaces,
			activeProfileId,
			getWorkspaceProfileId,
			limit,
		],
	);
}
