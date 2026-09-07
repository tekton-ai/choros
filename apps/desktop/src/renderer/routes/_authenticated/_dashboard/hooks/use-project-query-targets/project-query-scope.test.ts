import { describe, expect, test } from "bun:test";
import type { ProjectQueryTarget } from "./project-query-scope";
import {
	groupProjectTargetsByHost,
	selectProjectQueryScope,
} from "./project-query-scope";

const targets: ProjectQueryTarget[] = [
	{
		projectId: "web",
		projectName: "Web",
		hostId: "host-1",
		hostUrl: "http://localhost:3201",
	},
	{
		projectId: "api",
		projectName: "API",
		hostId: "host-1",
		hostUrl: "http://localhost:3201",
	},
	{
		projectId: "docs",
		projectName: "Docs",
		hostId: "host-2",
		hostUrl: "http://localhost:3202",
	},
	{
		projectId: "orphan",
		projectName: "Orphan",
		hostId: null,
		hostUrl: null,
	},
];

describe("groupProjectTargetsByHost", () => {
	test("groups projects under their serving host", () => {
		expect(groupProjectTargetsByHost(targets)).toEqual([
			{
				key: "host-1\0web,api",
				hostId: "host-1",
				hostUrl: "http://localhost:3201",
				projects: [
					{ projectId: "web", projectName: "Web" },
					{ projectId: "api", projectName: "API" },
				],
			},
			{
				key: "host-2\0docs",
				hostId: "host-2",
				hostUrl: "http://localhost:3202",
				projects: [{ projectId: "docs", projectName: "Docs" }],
			},
			{
				key: "\0orphan",
				hostId: null,
				hostUrl: null,
				projects: [{ projectId: "orphan", projectName: "Orphan" }],
			},
		]);
	});

	test("key changes when the project set changes", () => {
		const [withBoth] = groupProjectTargetsByHost(targets.slice(0, 2));
		const [withOne] = groupProjectTargetsByHost(targets.slice(0, 1));
		expect(withBoth?.key).not.toBe(withOne?.key);
	});
});

describe("Profile project query scope", () => {
	const projects = [
		{ projectKey: "work" },
		{ projectKey: "personal" },
		{ projectKey: "work-docs" },
	];
	const isVisible = (id: string) => id !== "personal";

	test("all-project queries and options exclude foreign projects", () => {
		const scope = selectProjectQueryScope(projects, [], isVisible);
		expect(scope.projects.map((project) => project.projectKey)).toEqual([
			"work",
			"work-docs",
		]);
		expect(scope.selectedProjects.map((project) => project.projectKey)).toEqual(
			["work", "work-docs"],
		);
	});

	test("explicit foreign filters cannot expand request targets", () => {
		const scope = selectProjectQueryScope(
			projects,
			["personal", "work-docs"],
			isVisible,
		);
		expect(scope.selectedProjects.map((project) => project.projectKey)).toEqual(
			["work-docs"],
		);
		expect(
			selectProjectQueryScope(projects, ["personal"], isVisible)
				.selectedProjects,
		).toEqual([]);
	});
});
