import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/use-dashboard-sidebar-state";
import { useProfiles } from "renderer/routes/_authenticated/providers/profile-provider";
import type {
	ProfileAssignmentResult,
	ProfileSubmissionContext,
} from "shared/profiles";
import { hostProjectListQueryKey } from "../use-host-project-ids";

export interface ProjectSetupResult {
	projectId: string;
	repoPath: string;
	mainWorkspaceId: string | null;
	created: boolean;
}

export interface FinalizedProjectSetupResult extends ProjectSetupResult {
	profileId: string;
	assignment: ProfileAssignmentResult | null;
	profileContext?: ProfileSubmissionContext;
}

/**
 * Side effects to apply after a project is created or set up on a host:
 * make sure it shows up in the sidebar, and invalidate the cached host
 * project list so callers re-evaluate `needsSetup`.
 */
export function useFinalizeProjectSetup() {
	const { ensureProjectInSidebar, ensureWorkspaceInSidebar } =
		useDashboardSidebarState();
	const queryClient = useQueryClient();
	const {
		assignCreatedMember,
		defaultProfileId,
		getProjectProfileId,
		registerPendingMember,
	} = useProfiles();

	return useCallback(
		async (
			hostUrl: string,
			result: ProjectSetupResult,
			profileContext?: ProfileSubmissionContext,
		): Promise<FinalizedProjectSetupResult> => {
			let assignment: ProfileAssignmentResult | null = null;
			if (result.created && profileContext) {
				const member = {
					kind: "project" as const,
					projectKey: result.projectId,
				};
				const releasePending = registerPendingMember(member, profileContext);
				try {
					// This boundary returns an object-success recovery result, never a
					// Host-create failure that could cause the caller to create twice.
					assignment = await assignCreatedMember(member, profileContext);
				} finally {
					releasePending();
				}
			}
			const profileId = result.created
				? (assignment?.profileId ?? defaultProfileId)
				: getProjectProfileId(result.projectId);
			if (result.mainWorkspaceId) {
				ensureWorkspaceInSidebar(result.mainWorkspaceId, result.projectId);
			} else {
				ensureProjectInSidebar(result.projectId);
			}
			void queryClient.invalidateQueries({
				queryKey: hostProjectListQueryKey(hostUrl),
			});
			return { ...result, profileId, assignment, profileContext };
		},
		[
			assignCreatedMember,
			defaultProfileId,
			ensureProjectInSidebar,
			ensureWorkspaceInSidebar,
			getProjectProfileId,
			queryClient,
			registerPendingMember,
		],
	);
}
