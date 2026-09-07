import { describe, expect, it } from "bun:test";
import {
	getAttentionWorkspaceIds,
	getProfileAttentionCounts,
} from "./attention-workspaces";

function binding(
	workspaceId: string,
	terminalId: string,
	lastEventType: string,
	lastEventAt = 100,
) {
	return { workspaceId, terminalId, lastEventType, lastEventAt };
}

const workspaces = [
	{ id: "project-workspace", hostId: "local", projectId: "project-a" },
	{ id: "background-workspace", hostId: "local", projectId: "project-a" },
	{ id: "session", hostId: "local", projectId: null },
	{ id: "manual-session", hostId: "local", projectId: null },
	{ id: "seen-workspace", hostId: "local", projectId: "project-b" },
	{ id: "working-workspace", hostId: "local", projectId: null },
	{ id: "default-session", hostId: "local", projectId: null },
];

function resolveProfile(workspace: (typeof workspaces)[number]): string {
	if (workspace.projectId === "project-a") return "profile-a";
	if (
		workspace.projectId === "project-b" ||
		(workspace.hostId === "local" &&
			(workspace.id === "session" || workspace.id === "manual-session"))
	) {
		return "profile-b";
	}
	return "default";
}

function total(counts: ReadonlyMap<string, number>): number {
	let count = 0;
	for (const value of counts.values()) count += value;
	return count;
}

describe("Profile attention", () => {
	it("counts each raw attention workspace once across terminals, cached queries, manual marks and duplicate rows", () => {
		const projectBindings = [
			binding("project-workspace", "permission", "PermissionRequest"),
			binding("project-workspace", "review", "Stop"),
		];
		const workspaceIds = getAttentionWorkspaceIds({
			bindingQueries: [
				[["terminal-agent-bindings", "project-workspace"], projectBindings],
				[["terminal-agent-bindings", "duplicate"], projectBindings],
				[
					["terminal-agent-bindings", "other"],
					[
						binding("background-workspace", "background", "Stop"),
						binding("session", "failed", "Failed"),
						binding("seen-workspace", "seen", "Stop"),
						binding("working-workspace", "working", "Start"),
					],
				],
				[["terminal-agent-bindings", "loading"], undefined],
			],
			manualUnread: {
				"project-workspace": true,
				session: true,
				"manual-session": true,
				"default-session": true,
				"missing-raw-row": true,
			},
			terminalSeenAt: { permission: 200, failed: 200, seen: 100 },
		});
		const counts = getProfileAttentionCounts({
			workspaceIds,
			workspaces: [...workspaces, ...workspaces],
			getWorkspaceProfileId: resolveProfile,
			defaultProfileId: "default",
		});

		expect(workspaceIds).toEqual(
			new Set([
				"project-workspace",
				"background-workspace",
				"session",
				"manual-session",
				"default-session",
				"missing-raw-row",
			]),
		);
		expect(counts).toEqual(
			new Map([
				["profile-a", 2],
				["profile-b", 2],
				["default", 2],
			]),
		);
		expect(total(counts)).toBe(workspaceIds.size);
	});

	it("clears seen reviews but keeps live permission, failure and manual unread until their own source clears", () => {
		const rows = [
			binding("review", "review-terminal", "Stop"),
			binding("permission", "permission-terminal", "PermissionRequest"),
			binding("failure", "failure-terminal", "Failed"),
			binding("manual", "manual-terminal", "Stop"),
		];
		const bindingQueries = [["bindings", rows]] as const;
		const manualUnread = { manual: true } as const;
		expect(
			getAttentionWorkspaceIds({
				bindingQueries,
				manualUnread,
				terminalSeenAt: {},
			}),
		).toEqual(new Set(["review", "permission", "failure", "manual"]));

		const terminalSeenAt = {
			"review-terminal": 100,
			"permission-terminal": 200,
			"failure-terminal": 200,
			"manual-terminal": 100,
		};
		expect(
			getAttentionWorkspaceIds({
				bindingQueries,
				manualUnread,
				terminalSeenAt,
			}),
		).toEqual(new Set(["permission", "failure", "manual"]));
		expect(
			getAttentionWorkspaceIds({
				bindingQueries: [],
				manualUnread,
				terminalSeenAt,
			}),
		).toEqual(new Set(["manual"]));
		expect(
			getAttentionWorkspaceIds({
				bindingQueries: [],
				manualUnread: {},
				terminalSeenAt,
			}),
		).toEqual(new Set());
	});

	it("rebuckets existing attention after ownership changes without changing the global total or seen state", () => {
		const terminalSeenAt = { terminal: 50 };
		const workspaceIds = getAttentionWorkspaceIds({
			bindingQueries: [
				["bindings", [binding("project-workspace", "terminal", "Stop")]],
			],
			manualUnread: {},
			terminalSeenAt,
		});
		const before = getProfileAttentionCounts({
			workspaceIds,
			workspaces,
			getWorkspaceProfileId: resolveProfile,
			defaultProfileId: "default",
		});
		const after = getProfileAttentionCounts({
			workspaceIds,
			workspaces,
			getWorkspaceProfileId: (workspace) =>
				workspace.projectId === "project-a"
					? "profile-b"
					: resolveProfile(workspace),
			defaultProfileId: "default",
		});

		expect(before).toEqual(new Map([["profile-a", 1]]));
		expect(after).toEqual(new Map([["profile-b", 1]]));
		expect(total(before)).toBe(workspaceIds.size);
		expect(total(after)).toBe(workspaceIds.size);
		expect(workspaceIds).toEqual(new Set(["project-workspace"]));
		expect(terminalSeenAt).toEqual({ terminal: 50 });
	});
});
