import { toast } from "@choros/ui/sonner";
import { useLingui } from "@lingui/react/macro";
import { useCallback } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/use-host-projects";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/local-host-service-provider";
import { useProfiles } from "renderer/routes/_authenticated/providers/profile-provider";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { useV2WorkspaceCreateDefaultsStore } from "renderer/stores/v2-workspace-create-defaults";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";
import { useWorkspaceCreateNavigation } from "renderer/stores/workspace-creates/use-workspace-create-navigation";

/**
 * Creates a v2 workspace immediately, skipping the new-workspace modal.
 * `projectIdHint` is the caller's best guess at "current project" (e.g. the
 * open v2 workspace route); when absent it falls back to the last-used
 * project, then the first known project. With no project to infer at all,
 * falls back to opening the modal so the user can add or pick one.
 */
export function useQuickCreateWorkspace() {
	const { t } = useLingui();
	const { machineId } = useLocalHostService();
	const { projects: hostProjects } = useHostProjects();
	const { submit } = useWorkspaceCreates();
	const openNewWorkspaceModal = useOpenNewWorkspaceModal();
	const { isProjectVisible, isReady } = useProfiles();
	const beginNavigation = useWorkspaceCreateNavigation();

	return useCallback(
		(projectIdHint?: string | null) => {
			const navigation = beginNavigation();
			const visibleProjects = hostProjects.filter(
				(project) =>
					isProjectVisible(project.projectKey) &&
					project.hostReachable &&
					project.hostIds.includes(machineId),
			);
			const projectId = [
				projectIdHint,
				useV2WorkspaceCreateDefaultsStore.getState().lastProjectId,
				visibleProjects[0]?.projectKey,
			].find(
				(id) =>
					id && visibleProjects.some((project) => project.projectKey === id),
			);

			if (!isReady || !projectId || !machineId) {
				openNewWorkspaceModal();
				return;
			}

			const workspaceId = crypto.randomUUID();
			const handle = submit({
				hostId: machineId,
				profileContext: navigation.profileContext,
				snapshot: { id: workspaceId, projectId },
			});
			void navigation.follow(handle).catch((error) => {
				console.error("[QuickCreateWorkspace] failed to open workspace", error);
			});
			toast.promise(
				handle.completed.then((outcome) => {
					if (!outcome.ok) throw new Error(outcome.error);
				}),
				{
					loading: t({
						id: "hooks.quickCreateWorkspace.creating",
						message: "Creating workspace...",
					}),
					success: t({
						id: "hooks.quickCreateWorkspace.created",
						message: "Workspace created",
					}),
					error: (error) =>
						error instanceof Error
							? error.message
							: t({
									id: "hooks.quickCreateWorkspace.createFailed",
									message: "Failed to create workspace",
								}),
				},
			);
		},
		[
			hostProjects,
			machineId,
			isProjectVisible,
			isReady,
			beginNavigation,
			openNewWorkspaceModal,
			submit,
			t,
		],
	);
}
