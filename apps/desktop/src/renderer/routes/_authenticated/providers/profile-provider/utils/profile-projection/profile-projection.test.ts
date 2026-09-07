import { describe, expect, it } from "bun:test";
import {
	type ProfileDefinition,
	type ProfileVisit,
	profileMemberKey,
} from "shared/profiles";
import { resolveFailedWorkspaceProfileId } from "./failed-workspace-profile";
import {
	type AccessibleProfileWorkspace,
	createProfileProjection,
	getRecentProfileWorkspaces,
	ProfileNavigationGeneration,
	parseProfileRoute,
	profileSwitchDestination,
	resolveProfileRecoveryTarget,
} from "./profile-projection";

const profiles: ProfileDefinition[] = ["default", "a", "b", "c"].map(
	(id, sortOrder) => ({
		id,
		name: id,
		isDefault: id === "default",
		sortOrder,
		createdAt: 0,
		updatedAt: 0,
	}),
);
const workspace = (
	id: string,
	projectId: string | null = null,
	hostId = "host",
): AccessibleProfileWorkspace => ({
	id,
	projectId,
	hostId,
	hostReachable: true,
	worktreeExists: true,
});
const visit = (
	workspaceId: string,
	visitedAt: number,
	profileId = "a",
	hostId = "host",
): ProfileVisit => ({ workspaceId, visitedAt, profileId, hostId });

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

describe("profile membership and real visits", () => {
	it("inherits project ownership while sessions use typed host-qualified identities", () => {
		const projection = createProfileProjection(profiles, [
			{ profileId: "a", member: { kind: "project", projectKey: "same" } },
			{
				profileId: "b",
				member: { kind: "session", hostId: "one", workspaceId: "same" },
			},
			{
				profileId: "deleted",
				member: { kind: "project", projectKey: "orphan" },
			},
		]);
		expect(projection.getWorkspaceProfileId(workspace("child", "same"))).toBe(
			"a",
		);
		expect(
			projection.getWorkspaceProfileId(workspace("same", null, "one")),
		).toBe("b");
		expect(
			projection.getWorkspaceProfileId(workspace("same", null, "two")),
		).toBe("default");
		expect(projection.getProjectProfileId("orphan")).toBe("default");
		expect(projection.getProjectProfileId("unassigned")).toBe("default");
	});

	it("keeps optimistic and canonical session ownership coherent without inventing a deleted profile", () => {
		const pending = new Map([
			[
				profileMemberKey({
					kind: "session",
					hostId: "host",
					workspaceId: "temporary",
				}),
				"a",
			],
			[
				profileMemberKey({
					kind: "session",
					hostId: "host",
					workspaceId: "canonical",
				}),
				"a",
			],
		]);
		const projection = createProfileProjection(profiles, [], pending);
		expect(projection.getWorkspaceProfileId(workspace("temporary"))).toBe("a");
		expect(projection.getWorkspaceProfileId(workspace("canonical"))).toBe("a");
		const deleted = createProfileProjection(
			profiles.filter((profile) => profile.id !== "a"),
			[],
			pending,
		);
		expect(deleted.getWorkspaceProfileId(workspace("canonical"))).toBe(
			"default",
		);
	});

	it("filters invalid and foreign visits before deduplication/cap and never picks an unvisited workspace", () => {
		const workspaces = [
			workspace("old"),
			workspace("session"),
			workspace("foreign"),
			workspace("never-opened"),
			{ ...workspace("missing-worktree"), worktreeExists: false },
			{ ...workspace("offline"), hostReachable: false },
			{ ...workspace("archived"), archivedAt: 12 },
		];
		const visits = [
			visit("foreign", 100),
			visit("deleted", 99),
			visit("offline", 98),
			visit("missing-worktree", 97),
			visit("archived", 96),
			visit("session", 8),
			visit("session", 7),
			visit("old", 2),
		];
		const result = getRecentProfileWorkspaces({
			visits,
			workspaces,
			profileId: "a",
			getWorkspaceProfileId: (row) => (row.id === "foreign" ? "b" : "a"),
			limit: 2,
		});
		expect(
			result.map(({ workspace, visitedAt }) => [workspace.id, visitedAt]),
		).toEqual([
			["session", 8],
			["old", 2],
		]);
	});
});

describe("profile navigation strategy", () => {
	it("uses PR project identity, never its list projects filter", () => {
		expect(
			parseProfileRoute(
				"/pull-requests/123?project=owner&projects=%5B%22other%22%5D",
			),
		).toEqual({ kind: "pull-request", projectId: "owner" });
		expect(profileSwitchDestination("/project/owner")).toBe("/v2-workspaces");
		expect(profileSwitchDestination("/pull-requests/123?project=owner")).toBe(
			"/pull-requests",
		);
		expect(profileSwitchDestination("/new-workspace")).toBeNull();
		expect(profileSwitchDestination("/settings/appearance")).toBeNull();
	});

	it("rejects delayed A/B success and failure after the user chose C", async () => {
		const clock = new ProfileNavigationGeneration();
		const requests = [
			["a", deferred<ProfileVisit[]>()],
			["b", deferred<ProfileVisit[]>()],
			["c", deferred<ProfileVisit[]>()],
		] as const;
		let errors = 0;
		const results = requests.map(([profileId, request]) => {
			const generation = clock.next();
			return resolveProfileRecoveryTarget({
				path: "/v2-workspace/source",
				profileId,
				getVisits: () => request.promise,
				getSnapshot: () => ({
					workspaces: [workspace("c-target")],
					getWorkspaceProfileId: () => "c",
				}),
				isCurrent: () => clock.isCurrent(generation),
				onError: () => {
					errors++;
				},
			});
		});
		requests[2][1].resolve([visit("c-target", 10, "c")]);
		expect(await results[2]).toBe("/v2-workspace/c-target");
		requests[0][1].resolve([visit("old-target", 100, "a")]);
		requests[1][1].reject(new Error("unavailable"));
		expect(await results[0]).toBeNull();
		expect(await results[1]).toBeNull();
		expect(errors).toBe(0);
	});

	it("rechecks membership when delayed visits arrive and retries only actually visited accessible targets", async () => {
		const pending = deferred<ProfileVisit[]>();
		let owner = "a";
		const args = {
			path: "/v2-workspace/source",
			profileId: "a",
			getVisits: () => pending.promise,
			getSnapshot: () => ({
				workspaces: [
					workspace("moved"),
					workspace("older"),
					workspace("never-opened"),
				],
				getWorkspaceProfileId: (row: { id: string }) =>
					row.id === "moved" ? owner : "a",
			}),
			isCurrent: () => true,
			onError: () => {
				throw new Error("unexpected failure");
			},
		};
		const result = resolveProfileRecoveryTarget(args);
		owner = "b";
		pending.resolve([visit("moved", 20), visit("older", 10)]);
		expect(await result).toBe("/v2-workspace/older");
		expect(
			await resolveProfileRecoveryTarget({
				...args,
				excludedWorkspaceIds: new Set([JSON.stringify(["host", "older"])]),
			}),
		).toBe("/v2-workspaces");
	});
});

describe("failed creation route ownership", () => {
	it("keeps a failed session's retry route in the submitted Profile after its optimistic row disappears", () => {
		const failure = {
			id: "attempt",
			hostId: "host",
			input: { projectId: null },
		};
		const projection = createProfileProjection(profiles, []);
		const owner = resolveFailedWorkspaceProfileId({
			failure,
			capturedProfileId: "a",
			profiles,
			defaultProfileId: "default",
			getProjectProfileId: projection.getProjectProfileId,
		});
		expect(owner).toBe("a");
		// Retaining the error screen does not fabricate a canonical workspace
		// or promote an unsuccessful attempt into the MRU restore candidates.
		expect(
			getRecentProfileWorkspaces({
				visits: [visit("attempt", 10)],
				workspaces: [],
				profileId: owner,
				getWorkspaceProfileId: projection.getWorkspaceProfileId,
			}),
		).toEqual([]);
	});

	it("inherits a moved project's failure route and falls back only when a captured session Profile was deleted", () => {
		const args = {
			capturedProfileId: "a",
			profiles,
			defaultProfileId: "default",
			getProjectProfileId: () => "b",
		};
		expect(
			resolveFailedWorkspaceProfileId({
				...args,
				failure: {
					id: "attempt",
					hostId: "host",
					input: { projectId: "moved-project" },
				},
			}),
		).toBe("b");
		expect(
			resolveFailedWorkspaceProfileId({
				...args,
				profiles: profiles.filter((profile) => profile.id !== "a"),
				failure: { id: "attempt", hostId: "host", input: { projectId: null } },
			}),
		).toBe("default");
	});
});
