import { expect, it } from "bun:test";
import {
	buildDashboardSidebarPinnedWorkspaces,
	buildDashboardSidebarProjects,
	buildDashboardSidebarSessions,
	type SidebarProjectInput,
	type SidebarWorkspaceInput,
} from "./build-dashboard-sidebar-projects";
import {
	getDashboardSidebarStatusWorkspaces,
	projectDashboardSidebar,
} from "./project-dashboard-sidebar";

const date = new Date("2026-01-01T00:00:00Z");
function project(id: string): SidebarProjectInput {
	return {
		id,
		name: id,
		githubOwner: null,
		githubRepoName: null,
		iconUrl: null,
		color: null,
		createdAt: date,
		updatedAt: date,
		isCollapsed: false,
	};
}
function workspace(
	id: string,
	projectId: string | null,
	tags: string[] = [],
): SidebarWorkspaceInput {
	return {
		id,
		projectId,
		tags,
		hostId: "host",
		type: projectId ? "worktree" : "session",
		hostIsOnline: true,
		name: id,
		branch: "main",
		createdAt: date,
		updatedAt: date,
		tabOrder: 1,
		sectionId: null,
		pinnedAt: null,
		pendingTransaction: null,
	};
}

it("projects every visible lane while retaining the original deduplicated background eligibility", () => {
	const sidebarProjects = [project("project-a"), project("project-b")];
	const projectRows = [
		workspace("work-a", "project-a"),
		workspace("work-b", "project-b"),
	];
	const pullRequestsByWorkspaceId = new Map();
	const raw = {
		groups: buildDashboardSidebarProjects({
			sidebarProjects,
			sidebarSections: [],
			visibleSidebarWorkspaces: projectRows,
			pullRequestsByWorkspaceId,
		}),
		pinnedWorkspaces: buildDashboardSidebarPinnedWorkspaces({
			sidebarProjects,
			pinnedSidebarWorkspaces: [projectRows[1], workspace("pinned-a", null)],
			pullRequestsByWorkspaceId,
		}),
		sessions: buildDashboardSidebarSessions({
			sessionSidebarWorkspaces: [
				workspace("session-a", null, ["shared"]),
				workspace("session-b", null, ["shared"]),
				workspace("only-b", null, ["hidden-tag"]),
			],
			pullRequestsByWorkspaceId,
		}),
	};
	const status = getDashboardSidebarStatusWorkspaces(raw);
	const visible = projectDashboardSidebar({
		...raw,
		isProjectVisible: (id) => id === "project-a",
		isWorkspaceVisible: (row) =>
			row.projectId === "project-a" || row.id.endsWith("-a"),
	});
	expect(visible.groups.map((row) => row.id)).toEqual(["project-a"]);
	expect(visible.pinnedWorkspaces.map((row) => row.id)).toEqual(["pinned-a"]);
	expect(visible.sessionWorkspaces.map((row) => row.id)).toEqual(["session-a"]);
	expect(
		visible.sessionTagGroups.map((group) => [
			group.tag,
			group.workspaces.map((row) => row.id),
		]),
	).toEqual([["shared", ["session-a"]]]);
	expect(status.map((row) => row.id).sort()).toEqual([
		"only-b",
		"pinned-a",
		"session-a",
		"session-b",
		"work-a",
		"work-b",
	]);
	expect(getDashboardSidebarStatusWorkspaces(raw)).toEqual(status);
});
