import { describe, expect, it } from "bun:test";
import {
	advanceProfileProjectSelection,
	createProfileProjectSelectionState,
	type ProfileProjectSelectionInput,
} from "./profile-project-selection";

function input(
	overrides: Partial<ProfileProjectSelectionInput> = {},
): ProfileProjectSelectionInput {
	return {
		isOpen: true,
		isReady: true,
		areProjectsReady: true,
		activeProfileId: "a",
		preSelectedProjectId: "project-a",
		preSelectedSession: false,
		projects: [{ id: "project-a" }],
		selectedProjectId: null,
		isSession: false,
		targetSelectionRequired: false,
		resetKey: 0,
		lastProjectId: null,
		isProjectVisible: (id) => id === "project-a",
		...overrides,
	};
}

const inB = {
	activeProfileId: "b",
	projects: [{ id: "project-b" }],
	isProjectVisible: (id: string) => id === "project-b",
};

describe("Profile creation target selection", () => {
	it("waits for restored Profile readiness before consuming an explicit session request", () => {
		const state = createProfileProjectSelectionState(0);
		expect(
			advanceProfileProjectSelection(
				state,
				input({
					isReady: false,
					activeProfileId: "default",
					preSelectedProjectId: null,
					preSelectedSession: true,
				}),
			),
		).toBeNull();
		expect(
			advanceProfileProjectSelection(
				state,
				input({ preSelectedProjectId: null, preSelectedSession: true }),
			),
		).toEqual({ kind: "session" });
	});

	it("requires reselection after a switch but accepts a fresh No project request", () => {
		const state = createProfileProjectSelectionState(0);
		expect(advanceProfileProjectSelection(state, input())).toEqual({
			kind: "project",
			projectId: "project-a",
		});
		expect(
			advanceProfileProjectSelection(
				state,
				input({ ...inB, selectedProjectId: "project-a" }),
			),
		).toEqual({ kind: "clear" });
		expect(
			advanceProfileProjectSelection(
				state,
				input({ ...inB, targetSelectionRequired: true }),
			),
		).toBeNull();
		expect(
			advanceProfileProjectSelection(
				state,
				input({
					...inB,
					targetSelectionRequired: true,
					preSelectedProjectId: null,
					preSelectedSession: true,
				}),
			),
		).toEqual({ kind: "session" });
	});

	it("does not replay a consumed URL hint when the old project later moves into the current Profile", () => {
		const state = createProfileProjectSelectionState(0);
		advanceProfileProjectSelection(state, input());
		advanceProfileProjectSelection(
			state,
			input({ ...inB, selectedProjectId: "project-a" }),
		);
		const moved = input({
			activeProfileId: "b",
			projects: [{ id: "project-a" }, { id: "project-b" }],
			isProjectVisible: () => true,
			targetSelectionRequired: true,
		});
		expect(advanceProfileProjectSelection(state, moved)).toBeNull();
		expect(
			advanceProfileProjectSelection(state, {
				...moved,
				preSelectedProjectId: "project-b",
			}),
		).toEqual({ kind: "project", projectId: "project-b" });
	});

	it("allows a new draft to apply its requested project without replaying hints over a manual selection", () => {
		const state = createProfileProjectSelectionState(0);
		advanceProfileProjectSelection(state, input());
		expect(
			advanceProfileProjectSelection(
				state,
				input({
					selectedProjectId: "manual-project",
					isProjectVisible: () => true,
				}),
			),
		).toBeNull();
		expect(
			advanceProfileProjectSelection(state, input({ resetKey: 1 })),
		).toEqual({ kind: "project", projectId: "project-a" });
	});
});
