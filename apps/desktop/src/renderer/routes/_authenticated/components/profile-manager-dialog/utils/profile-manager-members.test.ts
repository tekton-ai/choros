import { expect, it } from "bun:test";
import type { HostProjectItem } from "renderer/hooks/host-projects/use-host-projects";
import type { HostWorkspaceItem } from "renderer/hooks/host-workspaces/use-host-workspaces";
import { getProfileManagerMembers } from "./profile-manager-members";

it("retains persisted missing members and distinguishes host-qualified sessions without offering project children", () => {
	const project: HostProjectItem = {
		id: "project",
		projectKey: "project",
		name: "Same name",
		repoPath: "/work/project",
		repoOwner: null,
		repoName: null,
		repoUrl: null,
		icon: null,
		color: null,
		hostIds: ["host-a"],
		hostReachable: true,
		createdAt: 1,
		updatedAt: 1,
	};
	const workspace: HostWorkspaceItem = {
		id: "session",
		hostId: "host-a",
		projectId: null,
		name: "Session",
		branch: "main",
		type: "session",
		createdByUserId: null,
		taskId: null,
		createdAt: new Date(0),
		updatedAt: new Date(0),
		worktreePath: "/sessions/session",
		worktreeExists: true,
		hostReachable: true,
	};
	const members = getProfileManagerMembers({
		projects: [
			project,
			{
				...project,
				id: "other",
				projectKey: "other",
				repoPath: "/personal/project",
			},
		],
		workspaces: [
			workspace,
			{ ...workspace, id: "child", type: "worktree", projectId: "project" },
		],
		memberships: [
			{
				profileId: "work",
				member: { kind: "project", projectKey: "missing-project" },
			},
			{
				profileId: "work",
				member: { kind: "session", hostId: "host-a", workspaceId: "session" },
			},
			{
				profileId: "work",
				member: { kind: "session", hostId: "host-b", workspaceId: "session" },
			},
		],
		recoveryMembers: [
			{ kind: "session", hostId: "host-a", workspaceId: "created" },
		],
		getProjectProfileId: (id) =>
			id === "missing-project" ? "work" : "default",
		getWorkspaceProfileId: (row) => (row.id === "created" ? "default" : "work"),
	});
	const workMembers = members.filter((item) => item.profileId === "work");
	expect(workMembers).toHaveLength(3);
	expect(workMembers.map((item) => [item.member, item.unavailable])).toEqual(
		expect.arrayContaining([
			[{ kind: "session", hostId: "host-b", workspaceId: "session" }, true],
			[{ kind: "project", projectKey: "missing-project" }, true],
			[{ kind: "session", hostId: "host-a", workspaceId: "session" }, false],
		]),
	);
	expect(
		members
			.filter((item) => item.name === "Same name")
			.map((item) => item.detail)
			.sort(),
	).toEqual(["/personal/project", "/work/project"]);
	expect(
		members.some(
			(item) =>
				item.member.kind === "session" && item.member.workspaceId === "child",
		),
	).toBe(false);
	expect(
		members.find(
			(item) =>
				item.member.kind === "session" && item.member.workspaceId === "created",
		)?.profileId,
	).toBe("default");
});
