export interface ProfileProjectSelectionState {
	initialized: boolean;
	appliedProject: string | null;
	appliedSession: boolean;
	previousProfile: string | null;
	previousReset: number;
}

export interface ProfileProjectSelectionInput {
	isOpen: boolean;
	isReady: boolean;
	areProjectsReady: boolean;
	activeProfileId: string;
	preSelectedProjectId: string | null;
	preSelectedSession: boolean;
	projects: readonly { id: string }[];
	selectedProjectId: string | null;
	isSession: boolean;
	targetSelectionRequired: boolean;
	resetKey: number;
	lastProjectId: string | null;
	isProjectVisible: (projectId: string) => boolean;
}

export type ProfileProjectSelectionAction =
	| { kind: "project"; projectId: string }
	| { kind: "session" }
	| { kind: "clear" }
	| null;

export function createProfileProjectSelectionState(
	resetKey: number,
): ProfileProjectSelectionState {
	return {
		initialized: false,
		appliedProject: null,
		appliedSession: false,
		previousProfile: null,
		previousReset: resetKey,
	};
}

/** Advance only this form's bounded hint-consumption state; never mutate the draft. */
export function advanceProfileProjectSelection(
	state: ProfileProjectSelectionState,
	input: ProfileProjectSelectionInput,
): ProfileProjectSelectionAction {
	if (!input.isOpen) {
		state.initialized = false;
		state.appliedProject = null;
		state.appliedSession = false;
		state.previousProfile = null;
		return null;
	}
	if (!input.isReady || !input.areProjectsReady) return null;
	if (state.previousReset !== input.resetKey) {
		state.previousReset = input.resetKey;
		state.initialized = false;
		state.appliedProject = null;
		state.appliedSession = false;
	}
	const profileChanged =
		state.previousProfile !== null &&
		state.previousProfile !== input.activeProfileId;
	state.previousProfile = input.activeProfileId;
	if (profileChanged) {
		// Old URL hints are consumed, not choices in the new Profile.
		state.appliedProject = input.preSelectedProjectId;
		state.appliedSession = input.preSelectedSession;
		state.initialized = true;
	}
	const isValid = (id: string | null): id is string =>
		id !== null && input.projects.some((project) => project.id === id);
	if (!profileChanged) {
		if (!input.preSelectedSession) state.appliedSession = false;
		if (input.preSelectedProjectId === null) state.appliedProject = null;
		// A fresh explicit request satisfies required reselection; only implicit
		// defaults are forbidden after a Profile invalidates the old target.
		if (input.preSelectedSession && !state.appliedSession) {
			state.appliedSession = true;
			state.initialized = true;
			return { kind: "session" };
		}
		if (
			input.preSelectedProjectId !== state.appliedProject &&
			isValid(input.preSelectedProjectId)
		) {
			state.appliedProject = input.preSelectedProjectId;
			state.initialized = true;
			return { kind: "project", projectId: input.preSelectedProjectId };
		}
	}
	if (
		input.selectedProjectId &&
		!input.isProjectVisible(input.selectedProjectId)
	) {
		state.initialized = true;
		return { kind: "clear" };
	}
	if (input.targetSelectionRequired || input.isSession || state.initialized)
		return null;
	state.initialized = true;
	// A newly imported project can be valid before its Host list row arrives.
	if (input.selectedProjectId) return null;
	const projectId = isValid(input.lastProjectId)
		? input.lastProjectId
		: input.projects[0]?.id;
	return projectId ? { kind: "project", projectId } : null;
}
