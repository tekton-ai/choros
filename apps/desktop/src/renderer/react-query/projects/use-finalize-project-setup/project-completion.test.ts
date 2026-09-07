import { describe, expect, it } from "bun:test";
import type { ProfileSubmissionContext } from "shared/profiles";
import { createProjectCompletion } from "./project-completion";
import type { FinalizedProjectSetupResult } from "./use-finalize-project-setup";

function harness() {
	let requestId = 0;
	let generation = 0;
	let activeProfileId = "a";
	const owners = new Map<string, string>();
	const selections: { projectId: string; profileId: string }[] = [];
	const profiles = {
		get activeProfileId() {
			return activeProfileId;
		},
		captureSubmission: (): ProfileSubmissionContext => ({
			profileId: activeProfileId,
			requestId: String(++requestId),
			generation,
		}),
		isSubmissionCurrent: (context: ProfileSubmissionContext) =>
			context.generation === generation &&
			context.profileId === activeProfileId,
		getProjectProfileId: (projectId: string) =>
			owners.get(projectId) ?? "default",
		selectProfile: (profileId: string) => {
			activeProfileId = profileId;
			generation++;
		},
	};
	const completion = createProjectCompletion(() => ({
		profiles,
		onSelect: (projectId) =>
			selections.push({ projectId, profileId: activeProfileId }),
	}));
	return { completion, profiles, owners, selections };
}

function result(
	context: ProfileSubmissionContext,
): FinalizedProjectSetupResult {
	return {
		projectId: "existing-project",
		repoPath: "/repos/existing-project",
		mainWorkspaceId: null,
		created: false,
		profileId: "b",
		assignment: null,
		profileContext: context,
	};
}

describe("project completion", () => {
	it("selects an existing import only after selecting its rightful Profile", () => {
		const { completion, owners, selections } = harness();
		const request = completion.begin();
		owners.set("existing-project", "b");
		expect(completion.complete(request, result(request))).toBe(true);
		expect(selections).toEqual([
			{ projectId: "existing-project", profileId: "b" },
		]);
		expect(owners.get("existing-project")).toBe("b");
	});

	it("does not let a delayed callback consume or select into the current picker request", () => {
		const { completion, selections } = harness();
		const oldRequest = completion.begin();
		const currentRequest = completion.begin();
		expect(completion.complete(oldRequest, result(oldRequest))).toBe(false);
		expect(selections).toEqual([]);
		expect(completion.complete(currentRequest, result(currentRequest))).toBe(
			true,
		);
		expect(selections).toEqual([
			{ projectId: "existing-project", profileId: "default" },
		]);
	});

	it("does not pull a window back after a Profile switch, even if it switches back", () => {
		const { completion, profiles, selections } = harness();
		const request = completion.begin();
		profiles.selectProfile("b");
		profiles.selectProfile("a");
		expect(completion.complete(request, result(request))).toBe(false);
		expect(selections).toEqual([]);
	});

	it("leaves the current selection alone when its waiting UI closes", () => {
		const { completion, selections } = harness();
		const request = completion.begin();
		completion.cancel();
		expect(completion.complete(request, result(request))).toBe(false);
		expect(selections).toEqual([]);
	});
});
