import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { useDeletingWorkspacesStore } from "renderer/routes/_authenticated/_dashboard/stores/deleting-workspaces-store";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useCollections } from "renderer/routes/_authenticated/providers/collections-provider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/host-workspaces-provider";
import { useProfiles } from "renderer/routes/_authenticated/providers/profile-provider";
import { useTagFolderContext } from "renderer/routes/_authenticated/utils/workspace-tag-folders";
import { getFlattenedV2WorkspaceIds } from "../../utils/get-flattened-v2-workspace-ids";
import { resolveWorkspaceRemovalNavigationTarget } from "./navigation-target";

function reportRemovalNavigationError(error: unknown) {
	console.error("[useNavigateAwayFromWorkspace] navigation failed", error);
}

/**
 * If the user is viewing the workspace about to be removed, navigate to a
 * valid next visible workspace sibling (or home). No-ops when the active
 * route is a different workspace, so callers can fire this up-front without
 * hijacking the user if they've already moved on.
 */
export function useNavigateAwayFromWorkspace() {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const collections = useCollections();
	const { workspaces } = useHostWorkspaces();
	const { isWorkspaceVisible } = useProfiles();
	const visibleWorkspaces = useMemo(
		() => workspaces.filter(isWorkspaceVisible),
		[workspaces, isWorkspaceVisible],
	);
	const tagFolderContext = useTagFolderContext();
	const workspaceIds = useMemo(
		() => new Set(visibleWorkspaces.map((workspace) => workspace.id)),
		[visibleWorkspaces],
	);

	const navigateAwayFromWorkspace = useCallback(
		(
			workspaceId: string,
			additionalDeletingWorkspaceIds?: ReadonlySet<string>,
		) => {
			const workspaceMatch = matchRoute({
				to: "/v2-workspace/$workspaceId",
				fuzzy: true,
			});
			const activeWorkspaceId =
				workspaceMatch !== false ? workspaceMatch.workspaceId : null;
			const target = resolveWorkspaceRemovalNavigationTarget({
				activeWorkspaceId,
				removedWorkspaceId: workspaceId,
				orderedWorkspaceIds: getFlattenedV2WorkspaceIds(
					collections,
					visibleWorkspaces,
					tagFolderContext,
				),
				// A persisted sibling with unknown identity cannot be safely
				// offered as an ordinary, Profile-scoped navigation target.
				isWorkspaceValid: (id) => workspaceIds.has(id),
				// Rows mid-destroy stay listed until the archive commit lands
				// (after teardown) — exclude every in-flight destroy, not just
				// the caller's own batch. Read at call time for freshness.
				isWorkspaceDeleting: (id) =>
					additionalDeletingWorkspaceIds?.has(id) === true ||
					useDeletingWorkspacesStore.getState().deletingIds.has(id),
			});

			if (!target) return;
			if (target.kind === "workspace") {
				void navigateToV2Workspace(target.workspaceId, navigate, {
					replace: true,
				}).catch(reportRemovalNavigationError);
				return;
			}
			// Straight to the v2 empty state — "/" detours through the v1
			// workspace index, which can restore stale pre-migration state
			// (SUPER-1814).
			void navigate({ to: "/new-workspace", replace: true }).catch(
				reportRemovalNavigationError,
			);
		},
		[
			collections,
			workspaceIds,
			visibleWorkspaces,
			tagFolderContext,
			matchRoute,
			navigate,
		],
	);

	return { navigateAwayFromWorkspace };
}
