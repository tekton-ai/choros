import { useEffect, useRef } from "react";
import { useProfiles } from "renderer/routes/_authenticated/providers/profile-provider";
import { useNewWorkspaceDraftStore } from "renderer/stores/new-workspace-draft";
import { useV2WorkspaceCreateDefaultsStore } from "renderer/stores/v2-workspace-create-defaults";
import {
	advanceProfileProjectSelection,
	createProfileProjectSelectionState,
	type ProfileProjectSelectionState,
} from "./profile-project-selection";

/** Both creation surfaces consume defaults once, never as profile-switch fallback. */
export function useProfileProjectSelection({
	isOpen,
	preSelectedProjectId,
	preSelectedSession,
	projects,
	areProjectsReady,
}: {
	isOpen: boolean;
	preSelectedProjectId: string | null;
	preSelectedSession: boolean;
	projects: readonly { id: string }[];
	areProjectsReady: boolean;
}) {
	const { activeProfileId, isReady, isProjectVisible } = useProfiles();
	const selectedProjectId = useNewWorkspaceDraftStore(
		(state) => state.selectedProjectId,
	);
	const isSession = useNewWorkspaceDraftStore((state) => state.isSession);
	const targetSelectionRequired = useNewWorkspaceDraftStore(
		(state) => state.targetSelectionRequired,
	);
	const resetKey = useNewWorkspaceDraftStore((state) => state.resetKey);
	const selectionRef = useRef<ProfileProjectSelectionState | null>(null);
	if (selectionRef.current === null)
		selectionRef.current = createProfileProjectSelectionState(resetKey);
	const selection = selectionRef.current;

	useEffect(() => {
		const action = advanceProfileProjectSelection(selection, {
			isOpen,
			isReady,
			areProjectsReady,
			activeProfileId,
			preSelectedProjectId,
			preSelectedSession,
			projects,
			selectedProjectId,
			isSession,
			targetSelectionRequired,
			resetKey,
			lastProjectId: useV2WorkspaceCreateDefaultsStore.getState().lastProjectId,
			isProjectVisible,
		});
		const { clearTarget, selectProject, selectSession } =
			useNewWorkspaceDraftStore.getState();
		if (action?.kind === "project") selectProject(action.projectId);
		else if (action?.kind === "session") selectSession();
		else if (action?.kind === "clear") clearTarget();
	}, [
		selection,
		activeProfileId,
		areProjectsReady,
		isOpen,
		isProjectVisible,
		isReady,
		isSession,
		preSelectedProjectId,
		preSelectedSession,
		projects,
		resetKey,
		selectedProjectId,
		targetSelectionRequired,
	]);

	return targetSelectionRequired;
}
