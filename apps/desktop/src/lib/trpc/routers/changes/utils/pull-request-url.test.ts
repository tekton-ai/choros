import { describe, expect, test } from "bun:test";
import {
	buildPullRequestCompareUrl,
	normalizeGitHubRepoUrl,
	parseUpstreamRef,
} from "./pull-request-url";

describe("pull-request-url", () => {
	test("normalizes GitHub remote URLs", () => {
		expect(
			normalizeGitHubRepoUrl("https://github.com/choros-sh/choros.git"),
		).toBe("https://github.com/choros-sh/choros");
		expect(normalizeGitHubRepoUrl("git@github.com:Kitenite/choros.git")).toBe(
			"https://github.com/Kitenite/choros",
		);
		expect(
			normalizeGitHubRepoUrl("ssh://git@github.com/Kitenite/choros.git"),
		).toBe("https://github.com/Kitenite/choros");
	});

	test("parses upstream refs with slashes in branch names", () => {
		expect(parseUpstreamRef("kitenite/kitenite/halved-position")).toEqual({
			remoteName: "kitenite",
			branchName: "kitenite/halved-position",
		});
	});

	test("builds compare URLs for fork branches", () => {
		expect(
			buildPullRequestCompareUrl({
				baseRepoUrl: "https://github.com/choros-sh/choros.git",
				baseBranch: "main",
				headRepoOwner: "Kitenite",
				headBranch: "kitenite/halved-position",
			}),
		).toBe(
			"https://github.com/choros-sh/choros/compare/main...Kitenite:kitenite/halved-position?expand=1",
		);
	});
});
