import { afterEach, describe, expect, it } from "bun:test";
import { useNewWorkspaceDraftStore } from "./new-workspace-draft";

const originalState = useNewWorkspaceDraftStore.getState();
afterEach(() => useNewWorkspaceDraftStore.setState(originalState, true));

describe("profile-invalidated workspace draft", () => {
	it("requires a deliberate target choice while retaining non-repository input", () => {
		const store = useNewWorkspaceDraftStore.getState();
		store.selectProject("project-A");
		store.updateDraft({
			prompt: "Keep my investigation notes",
			workspaceName: "Investigation",
			workspaceNameEdited: true,
			selectedAgentId: "agent",
			branchName: "old-repo-branch",
			branchNameFromProvider: true,
			baseBranch: "release-A",
			baseBranchSource: "local",
			linkedPR: {
				prNumber: 42,
				title: "Old repo PR",
				url: "https://example.test/pr/42",
				state: "open",
			},
			linkedIssues: [{ slug: "A-1", title: "Old repo issue" }],
			attachments: [
				{
					localId: "attachment",
					state: "ready",
					file: { name: "notes.txt", size: 10, mediaType: "text/plain" },
					attachmentId: "uploaded",
				},
			],
		});
		const before = useNewWorkspaceDraftStore.getState();
		store.clearTarget();
		const cleared = useNewWorkspaceDraftStore.getState();
		expect(cleared.selectedProjectId).toBeNull();
		expect(cleared.isSession).toBe(false);
		expect(cleared.targetSelectionRequired).toBe(true);
		expect(cleared.baseBranch).toBeNull();
		expect(cleared.branchName).toBe("");
		expect(cleared.branchNameFromProvider).toBe(false);
		expect(cleared.linkedPR).toBeNull();
		expect(cleared.linkedIssues).toEqual([]);
		expect(cleared.prompt).toBe(before.prompt);
		expect(cleared.workspaceName).toBe(before.workspaceName);
		expect(cleared.workspaceNameEdited).toBe(true);
		expect(cleared.attachments).toEqual(before.attachments);
		expect(cleared.selectedAgentId).toBe("agent");
		expect(cleared.resetKey).toBe(before.resetKey);

		store.selectProject("project-B");
		expect(useNewWorkspaceDraftStore.getState().targetSelectionRequired).toBe(
			false,
		);
		expect(useNewWorkspaceDraftStore.getState().isSession).toBe(false);
		store.clearTarget();
		store.selectSession();
		expect(useNewWorkspaceDraftStore.getState().targetSelectionRequired).toBe(
			false,
		);
		expect(useNewWorkspaceDraftStore.getState().isSession).toBe(true);
		expect(useNewWorkspaceDraftStore.getState().prompt).toBe(before.prompt);
	});
});
