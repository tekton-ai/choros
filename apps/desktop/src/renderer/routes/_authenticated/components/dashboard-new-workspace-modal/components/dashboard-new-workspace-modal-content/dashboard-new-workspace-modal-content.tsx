import { Trans } from "@lingui/react/macro";
import { useEffect, useMemo, useRef } from "react";
import { resolveProjectIconUrl } from "renderer/hooks/host-projects/resolve-project-icon-url";
import { useHostProjects } from "renderer/hooks/host-projects/use-host-projects";
import { useProfiles } from "renderer/routes/_authenticated/providers/profile-provider";
import { useV2WorkspaceCreateDefaultsStore } from "renderer/stores/v2-workspace-create-defaults";
import { useDashboardNewWorkspaceDraft } from "../../dashboard-new-workspace-draft-context";
import { PromptGroup } from "../dashboard-new-workspace-form/prompt-group";
import { useProfileProjectSelection } from "./hooks/use-profile-project-selection/use-profile-project-selection";
import { useSelectedHostProjectIds } from "./hooks/use-selected-host-project-ids";

interface DashboardNewWorkspaceModalContentProps {
	isOpen: boolean;
	preSelectedProjectId: string | null;
	/** Open with "No project" (session) preselected. */
	preSelectedSession?: boolean;
}

/**
 * Content pane for the Dashboard new-workspace modal.
 *
 * Resolves the project list from the host fan-out (projects are fully
 * local) and handles the initial project selection when the modal opens.
 * Delegates the composer itself to PromptGroup.
 */
export function DashboardNewWorkspaceModalContent({
	isOpen,
	preSelectedProjectId,
	preSelectedSession = false,
}: DashboardNewWorkspaceModalContentProps) {
	const { draft, updateDraft, selectProject, selectSession } =
		useDashboardNewWorkspaceDraft();
	const setLastProjectId = useV2WorkspaceCreateDefaultsStore(
		(state) => state.setLastProjectId,
	);
	const { projects: hostProjects, isReady: areProjectsReady } =
		useHostProjects();
	const { isProjectVisible } = useProfiles();

	const setUpProjectIds = useSelectedHostProjectIds(draft.hostId);

	const recentProjects = useMemo(
		() =>
			hostProjects
				.filter((project) => isProjectVisible(project.projectKey))
				.map((project) => ({
					id: project.projectKey,
					name: project.name,
					githubOwner: project.repoOwner,
					githubRepoName: project.repoName,
					iconUrl: resolveProjectIconUrl(project),
					needsSetup:
						setUpProjectIds === null
							? null
							: !setUpProjectIds.has(project.projectKey),
				})),
		[hostProjects, isProjectVisible, setUpProjectIds],
	);
	const appliedHostIdRef = useRef(false);

	useEffect(() => {
		if (!isOpen) {
			appliedHostIdRef.current = false;
			return;
		}
		if (appliedHostIdRef.current) return;
		appliedHostIdRef.current = true;
		const persistedHostId =
			useV2WorkspaceCreateDefaultsStore.getState().lastHostId;
		if (typeof persistedHostId === "string") {
			updateDraft({ hostId: persistedHostId });
		}
	}, [isOpen, updateDraft]);

	const targetSelectionRequired = useProfileProjectSelection({
		isOpen,
		preSelectedProjectId,
		preSelectedSession,
		projects: recentProjects,
		areProjectsReady,
	});

	const selectedProject = recentProjects.find(
		(project) => project.id === draft.selectedProjectId,
	);

	return (
		<div className="flex-1 overflow-y-auto">
			{targetSelectionRequired && (
				<output className="px-4 py-2 text-sm text-muted-foreground">
					<Trans id="profiles.creation.selectTarget">
						Select a project in this profile or choose No project. Your draft
						has been kept.
					</Trans>
				</output>
			)}
			<PromptGroup
				projectId={
					draft.selectedProjectId && isProjectVisible(draft.selectedProjectId)
						? draft.selectedProjectId
						: null
				}
				selectedProject={selectedProject}
				recentProjects={recentProjects.filter((project) => Boolean(project.id))}
				isSessionSelected={draft.isSession}
				onSelectProject={(selectedProjectId) => {
					if (selectedProjectId === null) {
						selectSession();
						return;
					}
					setLastProjectId(selectedProjectId);
					selectProject(selectedProjectId);
				}}
			/>
		</div>
	);
}
