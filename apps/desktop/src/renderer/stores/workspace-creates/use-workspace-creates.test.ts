import { describe, expect, it } from "bun:test";
import type {
	ProfileAssignmentResult,
	ProfileMemberRef,
	ProfileSubmissionContext,
} from "shared/profiles";
import {
	type CreatedWorkspaceResult,
	completeWorkspaceCreate,
} from "./complete-workspace-create";
import { createWorkspaceNavigation } from "./create-workspace-navigation";

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

function createScenario() {
	const host = deferred<CreatedWorkspaceResult>();
	const classification = deferred<ProfileAssignmentResult>();
	const context: ProfileSubmissionContext = {
		profileId: "A",
		requestId: "request-1",
		generation: 1,
	};
	let activeProfile = "A";
	let generation = 1;
	let location = { href: "/v2-workspaces", key: "start" };
	let uiIdentity = 1;
	let expectedUiIdentity = uiIdentity;
	let createCalls = 0;
	let closeCalls = 0;
	const objects = new Set(["temporary"]);
	const failed = new Map<string, string>();
	const ownership = new Map<string, string>();
	const pending = new Map<string, string>([["temporary", "A"]]);
	const registerPendingMember = (
		member: ProfileMemberRef,
		submission: ProfileSubmissionContext,
	) => {
		if (member.kind !== "session")
			throw new Error("Unexpected project assignment");
		pending.set(member.workspaceId, submission.profileId);
		return () => {
			pending.delete(member.workspaceId);
		};
	};
	const createSession = () => {
		createCalls += 1;
		return host.promise;
	};
	const completed = completeWorkspaceCreate({
		optimisticWorkspaceId: "temporary",
		hostId: "local",
		create: createSession,
		profileContext: context,
		registerPendingMember,
		assignCreatedMember: async (member, submission) => {
			if (member.kind !== "session")
				throw new Error("Unexpected project assignment");
			const result = await classification.promise;
			if (result.assigned)
				ownership.set(member.workspaceId, submission.profileId);
			return result;
		},
		getProjectProfileId: () => "project-owner",
		onCreated: (result) => {
			objects.delete("temporary");
			objects.add(result.workspace.id);
		},
		onFailed: (message) => {
			objects.delete("temporary");
			failed.set("temporary", message);
		},
		clearPendingMember: () => {
			pending.delete("temporary");
		},
	});
	const navigation = createWorkspaceNavigation({
		context,
		isCurrent: (submission) =>
			submission.profileId === activeProfile &&
			submission.generation === generation,
		getLocation: () => location,
		isUiCurrent: () => uiIdentity === expectedUiIdentity,
		captureUi: () => {
			expectedUiIdentity = uiIdentity;
		},
		navigate: async (workspaceId) => {
			location = { href: `/v2-workspace/${workspaceId}`, key: workspaceId };
		},
	});
	return {
		host,
		classification,
		completed,
		objects,
		failed,
		ownership,
		pending,
		follow: () =>
			navigation.follow({ workspaceId: "temporary", completed }, () => {
				closeCalls += 1;
			}),
		resolveSession: () =>
			host.resolve({ workspace: { id: "canonical", projectId: null } }),
		get location() {
			return location;
		},
		get createCalls() {
			return createCalls;
		},
		get closeCalls() {
			return closeCalls;
		},
		switchProfile() {
			activeProfile = "B";
			generation += 1;
			location = { href: "/v2-workspaces", key: "B-list" };
		},
		reopenDraft() {
			uiIdentity += 1;
		},
		revisitOptimisticRoute() {
			location = { href: "/v2-workspace/temporary", key: "later-visit" };
		},
	};
}

describe("workspace creation ownership and completion", () => {
	it("keeps a canonical session in submitted A after switching to B without redirecting B", async () => {
		const scenario = createScenario();
		const following = scenario.follow();
		await Promise.resolve();
		scenario.switchProfile();
		scenario.resolveSession();
		await Promise.resolve();
		expect(scenario.pending.get("canonical")).toBe("A");
		scenario.classification.resolve({ profileId: "A", assigned: true });
		await Promise.all([scenario.completed, following]);
		expect(scenario.ownership.get("canonical")).toBe("A");
		expect(scenario.ownership.has("temporary")).toBe(false);
		expect(scenario.pending.size).toBe(0);
		expect(scenario.objects).toEqual(new Set(["canonical"]));
		expect(scenario.location).toEqual({
			href: "/v2-workspaces",
			key: "B-list",
		});
	});

	it("returns the created Default object on classification failure without exposing Host retry", async () => {
		const scenario = createScenario();
		const following = scenario.follow();
		scenario.resolveSession();
		scenario.classification.resolve({ profileId: "default", assigned: false });
		const outcome = await scenario.completed;
		await following;
		expect(outcome).toEqual({
			ok: true,
			workspaceId: "canonical",
			profileAssignment: { profileId: "default", assigned: false },
		});
		expect(scenario.objects).toEqual(new Set(["canonical"]));
		expect(scenario.ownership.get("canonical") ?? "default").toBe("default");
		expect(scenario.failed.size).toBe(0);
		expect(scenario.pending.size).toBe(0);
		expect(scenario.createCalls).toBe(1);
		expect(scenario.location.href).not.toBe("/v2-workspace/canonical");
	});

	it("follows canonical identity only for the still-awaited optimistic navigation", async () => {
		const scenario = createScenario();
		const following = scenario.follow();
		scenario.resolveSession();
		scenario.classification.resolve({ profileId: "A", assigned: true });
		await following;
		expect(scenario.location.href).toBe("/v2-workspace/canonical");
	});

	it("does not hijack a later visit to the same optimistic route", async () => {
		const scenario = createScenario();
		const following = scenario.follow();
		await Promise.resolve();
		scenario.revisitOptimisticRoute();
		scenario.resolveSession();
		scenario.classification.resolve({ profileId: "A", assigned: true });
		await following;
		expect(scenario.location.key).toBe("later-visit");
	});

	it("does not close a reopened draft when an earlier upload finishes", async () => {
		const scenario = createScenario();
		scenario.reopenDraft();
		const following = scenario.follow();
		scenario.resolveSession();
		scenario.classification.resolve({ profileId: "A", assigned: true });
		await Promise.all([following, scenario.completed]);
		expect(scenario.closeCalls).toBe(0);
		expect(scenario.location.href).toBe("/v2-workspaces");
		expect(scenario.ownership.get("canonical")).toBe("A");
	});

	it("retains the real Host failure retry path and clears temporary ownership", async () => {
		const scenario = createScenario();
		scenario.host.reject(new Error("Host unavailable"));
		expect(await scenario.completed).toEqual({
			ok: false,
			error: "Host unavailable",
		});
		expect(scenario.failed.get("temporary")).toBe("Host unavailable");
		expect(scenario.objects.size).toBe(0);
		expect(scenario.pending.size).toBe(0);
	});

	it("project workspaces inherit existing project ownership instead of becoming session members", async () => {
		const scenario = createScenario();
		scenario.host.resolve({
			workspace: { id: "worktree", projectId: "existing-project" },
		});
		expect(await scenario.completed).toEqual({
			ok: true,
			workspaceId: "worktree",
			profileAssignment: { profileId: "project-owner", assigned: true },
		});
		expect(scenario.ownership.size).toBe(0);
		expect(scenario.pending.size).toBe(0);
	});
});
