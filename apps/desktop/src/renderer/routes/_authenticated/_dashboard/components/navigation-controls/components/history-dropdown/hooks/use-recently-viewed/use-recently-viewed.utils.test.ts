import { expect, test } from "bun:test";
import { getRecentHistoryWorkspaces } from "./use-recently-viewed.utils";

const workspace = (id: string, projectId: string | null = "project") => ({
	id,
	projectId,
	hostId: "local",
	hostReachable: true,
	worktreeExists: true,
});

test("unclassified history includes sessions and deduplicates accessible entries before limiting", () => {
	const workspaces = [
		workspace("older"),
		workspace("project-work"),
		workspace("session/one", null),
		{ ...workspace("archived"), archivedAt: 1 },
		{ ...workspace("offline"), hostReachable: false },
		{ ...workspace("missing-worktree"), worktreeExists: false },
	];
	const entries = [
		"/v2-workspace/older",
		"/v2-workspace/project-work",
		"/v2-workspace/session%2Fone",
		"/v2-workspace/session%2Fone?tab=terminal",
		"/v2-workspace/archived",
		"/v2-workspace/offline",
		"/v2-workspace/missing-worktree",
		"/v2-workspace/unknown",
		"/settings/experimental",
	].map((path) => ({ path }));
	expect(
		getRecentHistoryWorkspaces({ entries, workspaces, limit: 2 }).map(
			(row) => row.id,
		),
	).toEqual(["session/one", "project-work"]);
});
