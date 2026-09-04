import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const CODE_EXTENSIONS = new Set([
	".bash",
	".c",
	".cc",
	".cjs",
	".cpp",
	".css",
	".cts",
	".fish",
	".go",
	".gql",
	".graphql",
	".h",
	".hpp",
	".java",
	".js",
	".jsx",
	".kt",
	".kts",
	".less",
	".mjs",
	".mts",
	".py",
	".rs",
	".sass",
	".scss",
	".sh",
	".sql",
	".svelte",
	".swift",
	".ts",
	".tsx",
	".vue",
	".zsh",
]);

const RESERVED_DIRECTORIES = new Set([
	"ISSUE_TEMPLATE",
	"PULL_REQUEST_TEMPLATE",
	"__fixtures__",
	"__mocks__",
	"__snapshots__",
	"__tests__",
]);

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LOCALE_DIRECTORY = /^[a-z]{2}(?:-[A-Z]{2})?$/;

function semanticName(name: string): string {
	return name.replace(/^[._$@()[\]-]+/, "").replace(/[\])]+$/, "");
}

export function isCompliantDirectoryName(name: string): boolean {
	if (RESERVED_DIRECTORIES.has(name) || LOCALE_DIRECTORY.test(name))
		return true;
	if (/^[._$@[(]/.test(name)) return true;
	return KEBAB_CASE.test(name);
}

export function isCompliantCodeFilename(filename: string): boolean {
	const extension = path.extname(filename).toLowerCase();
	if (!CODE_EXTENSIONS.has(extension)) return true;
	const parts = semanticName(filename).split(".");
	return parts.every((part) => KEBAB_CASE.test(part));
}

function actualPathCasing(file: string): string | null {
	let directory = process.cwd();
	const actualParts: string[] = [];
	for (const requestedPart of file.split("/")) {
		let entries: string[];
		try {
			entries = readdirSync(directory);
		} catch {
			return null;
		}
		const actualPart =
			entries.find((entry) => entry === requestedPart) ??
			entries.find(
				(entry) => entry.toLowerCase() === requestedPart.toLowerCase(),
			);
		if (!actualPart) return null;
		actualParts.push(actualPart);
		directory = path.join(directory, actualPart);
	}
	return actualParts.join("/");
}

export function findNamingViolations(files: string[]): string[] {
	const violations = new Set<string>();
	const actualFiles = new Set(
		files.map(actualPathCasing).filter((file): file is string => file !== null),
	);
	for (const file of actualFiles) {
		if (
			!file.includes("/drizzle/") &&
			!isCompliantCodeFilename(path.basename(file))
		) {
			violations.add(file);
		}
		const parts = file.split("/").slice(0, -1);
		for (let index = 0; index < parts.length; index += 1) {
			const name = parts[index];
			if (name && !isCompliantDirectoryName(name)) {
				violations.add(`${parts.slice(0, index + 1).join("/")}/`);
			}
		}
	}
	return [...violations].sort();
}

if (import.meta.main) {
	const files = execFileSync(
		"git",
		["ls-files", "--cached", "--others", "--exclude-standard"],
		{ encoding: "utf8" },
	)
		.split("\n")
		.filter(Boolean);
	const violations = findNamingViolations(files);
	if (violations.length > 0) {
		console.error(
			"Code files and directories must use lowercase kebab-case:\n" +
				violations.map((item) => `  ${item}`).join("\n"),
		);
		process.exit(1);
	}
}
