import { afterEach, describe, expect, it } from "bun:test";
import type { FinalizedProjectSetupResult } from "renderer/react-query/projects";
import { useAddRepositoryModalStore } from "./add-repository-modal";

const project: FinalizedProjectSetupResult = {
	projectId: "project-1",
	repoPath: "/repos/project-1",
	mainWorkspaceId: null,
	created: true,
	profileId: "profile-a",
	assignment: { profileId: "profile-a", assigned: true },
	profileContext: {
		profileId: "profile-a",
		requestId: "submit-1",
		generation: 1,
	},
};

function activeRequestId() {
	const { active } = useAddRepositoryModalStore.getState();
	if (active.kind === "none")
		throw new Error("Expected an open project request");
	return active.requestId;
}

describe("add repository modal store", () => {
	afterEach(() => {
		const { active, close } = useAddRepositoryModalStore.getState();
		if (active.kind !== "none") close(active.requestId);
	});

	it("delivers only the matching modal's successful project to its waiting picker", async () => {
		const store = useAddRepositoryModalStore.getState();
		const oldPicker = store.openEmptyProject();
		const oldRequestId = activeRequestId();
		const currentPicker = store.openNewProject();
		const currentRequestId = activeRequestId();
		const selections: string[] = [];
		void currentPicker.then((result) => {
			if (result) selections.push(result.projectId);
		});

		expect(await oldPicker).toBeNull();
		expect(store.resolveNewProject(oldRequestId, project)).toBe(false);
		store.close(oldRequestId);
		await Promise.resolve();
		expect(selections).toEqual([]);
		expect(activeRequestId()).toBe(currentRequestId);

		const currentProject = { ...project, projectId: "project-2" };
		expect(store.resolveNewProject(currentRequestId, currentProject)).toBe(
			true,
		);
		expect(await currentPicker).toEqual({
			...currentProject,
			requestId: currentRequestId,
		});
		expect(selections).toEqual(["project-2"]);
	});

	it("cancels a closed request without accepting its delayed completion", async () => {
		const store = useAddRepositoryModalStore.getState();
		const result = store.openTemplateGallery();
		const requestId = activeRequestId();
		store.close(requestId);
		expect(await result).toBeNull();
		expect(store.resolveNewProject(requestId, project)).toBe(false);
		expect(useAddRepositoryModalStore.getState().active.kind).toBe("none");
	});
});
