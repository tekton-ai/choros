import { afterEach, describe, expect, mock, test } from "bun:test";

type FindResult = {
	hostId: string;
	workspace: Record<string, unknown> | undefined;
};
let findResult: FindResult = { hostId: "host-1", workspace: undefined };
mock.module("../../../lib/host-workspaces", () => ({
	findWorkspaceOnHost: async () => findResult,
}));

const { default: getCommand } = await import("./command");

const WORKSPACE = {
	id: "b502bf30-8693-4815-be65-795035e0ce5f",
	projectId: "proj-1",
	projectName: "Choros",
	hostId: "host-1",
	name: "ludicrous-candytuft",
	branch: "setup",
	type: "worktree" as const,
	createdAt: new Date("2026-04-24T22:00:41.950Z"),
	updatedAt: new Date("2026-04-24T22:00:41.950Z"),
	worktreePath: "/home/me/.choros/worktrees/proj-1/setup",
	worktreeExists: true,
};

function invoke(args: { id?: string }, options: { field?: string } = {}) {
	return getCommand.run({
		ctx: {},
		args: args as never,
		options: options as never,
		signal: new AbortController().signal,
	});
}

afterEach(() => {
	findResult = { hostId: "host-1", workspace: undefined };
	delete process.env.CHOROS_WORKSPACE_ID;
});

describe("workspaces get", () => {
	test("resolves a local workspace by explicit id", async () => {
		findResult = { hostId: "host-1", workspace: { ...WORKSPACE } };
		const result = (await invoke({ id: WORKSPACE.id })) as {
			data: Record<string, unknown>;
			message: string;
		};
		expect(result.data.name).toBe("ludicrous-candytuft");
		expect(result.data.projectName).toBe("Choros");
		expect(result.data.hostName).toBe("host-1");
		expect(result.data.worktreePath).toBe(WORKSPACE.worktreePath);
		expect(result.message).toContain("ludicrous-candytuft");
	});

	test("defaults the id to CHOROS_WORKSPACE_ID", async () => {
		process.env.CHOROS_WORKSPACE_ID = WORKSPACE.id;
		findResult = { hostId: "host-1", workspace: { ...WORKSPACE } };
		const result = (await invoke({})) as { data: Record<string, unknown> };
		expect(result.data.id).toBe(WORKSPACE.id);
	});

	test("requires an id", async () => {
		await expect(invoke({})).rejects.toThrow(/No workspace id/);
	});

	test("prints a selected field", async () => {
		findResult = { hostId: "host-1", workspace: { ...WORKSPACE } };
		const result = (await invoke({ id: WORKSPACE.id }, { field: "name" })) as {
			message: string;
		};
		expect(result.message).toBe("ludicrous-candytuft");
	});

	test("prints an empty string for a null field", async () => {
		findResult = {
			hostId: "host-1",
			workspace: { ...WORKSPACE, worktreePath: null },
		};
		const result = (await invoke(
			{ id: WORKSPACE.id },
			{ field: "worktreePath" },
		)) as { message: string };
		expect(result.message).toBe("");
	});

	test("rejects unknown fields", async () => {
		findResult = { hostId: "host-1", workspace: { ...WORKSPACE } };
		await expect(
			invoke({ id: WORKSPACE.id }, { field: "bogus" }),
		).rejects.toThrow(/Unknown field: bogus/);
	});

	test("reports a missing local workspace", async () => {
		await expect(invoke({ id: WORKSPACE.id })).rejects.toThrow(/not found/);
	});
});
