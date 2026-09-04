import { describe, expect, it } from "bun:test";
import {
	deriveWorkspaceNameFromWorktreeSegments,
	normalizeWorkspaceName,
} from "./worktree-id";

describe("normalizeWorkspaceName", () => {
	it("returns undefined for empty or default names", () => {
		expect(normalizeWorkspaceName(undefined)).toBeUndefined();
		expect(normalizeWorkspaceName("")).toBeUndefined();
		expect(normalizeWorkspaceName("choros")).toBeUndefined();
	});

	it("sanitizes and limits to 32 characters", () => {
		const normalized = normalizeWorkspaceName(
			"My Feature/Branch_Name With Spaces 1234567890",
		);
		expect(normalized).toBe("my-feature-branch-name-with-spac");
		expect(normalized?.length).toBeLessThanOrEqual(32);
	});
});

describe("deriveWorkspaceNameFromWorktreeSegments", () => {
	it("handles branch-style worktree paths", () => {
		expect(
			deriveWorkspaceNameFromWorktreeSegments([
				"choros",
				"my-branch",
				"apps",
				"desktop",
			]),
		).toBe("my-branch");
	});

	it("uses all segments after project to reduce collisions", () => {
		expect(
			deriveWorkspaceNameFromWorktreeSegments([
				"choros",
				"kitenite",
				"review",
				"pr-1087",
				"apps",
				"desktop",
			]),
		).toBe("kitenite-review-pr-1087");
	});

	it("falls back to the remaining path when apps/desktop suffix is absent", () => {
		expect(
			deriveWorkspaceNameFromWorktreeSegments(["choros", "feature", "path"]),
		).toBe("feature-path");
	});

	it("returns undefined when no workspace segment exists", () => {
		expect(
			deriveWorkspaceNameFromWorktreeSegments(["choros", "apps", "desktop"]),
		).toBeUndefined();
	});

	it("keeps derived names bounded for protocol safety", () => {
		const derived = deriveWorkspaceNameFromWorktreeSegments([
			"choros",
			"very",
			"long",
			"branch",
			"name",
			"with",
			"many",
			"segments",
			"apps",
			"desktop",
		]);
		expect(derived).toBeDefined();
		expect(derived?.length).toBeLessThanOrEqual(32);
		expect(`choros-${derived}`.length).toBeLessThanOrEqual(41);
	});
});
