import { describe, expect, test } from "bun:test";
import {
	isCompliantCodeFilename,
	isCompliantDirectoryName,
} from "./check-code-path-naming";

describe("code path naming policy", () => {
	test("accepts kebab-case code files and directories", () => {
		expect(isCompliantCodeFilename("metrics-chart.test.tsx")).toBe(true);
		expect(isCompliantDirectoryName("metrics-chart")).toBe(true);
	});

	test("rejects camelCase and PascalCase project-owned names", () => {
		expect(isCompliantCodeFilename("metricsChart.tsx")).toBe(false);
		expect(isCompliantCodeFilename("MetricsChart.tsx")).toBe(false);
		expect(isCompliantDirectoryName("metricsChart")).toBe(false);
		expect(isCompliantDirectoryName("MetricsChart")).toBe(false);
	});

	test("preserves framework and locale directory sentinels", () => {
		expect(isCompliantDirectoryName("_authenticated")).toBe(true);
		expect(isCompliantDirectoryName("$workspaceId")).toBe(true);
		expect(isCompliantDirectoryName("ISSUE_TEMPLATE")).toBe(true);
		expect(isCompliantDirectoryName("pt-BR")).toBe(true);
		expect(isCompliantCodeFilename("-layout.tsx")).toBe(true);
	});

	test("does not constrain documentation filenames", () => {
		expect(isCompliantCodeFilename("ArchitectureGuide.md")).toBe(true);
	});
});
