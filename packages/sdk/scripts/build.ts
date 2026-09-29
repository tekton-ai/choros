/**
 * Build @choros/sdk into a publish-ready ./dist directory.
 *
 *   bun run scripts/build.ts
 *
 * Then to publish:
 *   cd dist && npm publish --access public
 *
 * Strategy: bun bundles runtime code, tsc preserves the generated REST SDK's
 * declarations, and Rollup inlines the private Host declaration boundary.
 * dist/package.json declares public packages referenced by that boundary.
 */

import { execFileSync } from "node:child_process";
import {
	copyFileSync,
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rollup } from "rollup";
import { dts } from "rollup-plugin-dts";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DIST = join(ROOT, "dist");
const WORKSPACE_ROOT = resolve(ROOT, "../..");

interface PackageManifest {
	name?: string;
	version?: string;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
	exports?: Record<string, string | { types?: string; default?: string }>;
}

function readManifest(path: string): PackageManifest {
	return JSON.parse(readFileSync(path, "utf8")) as PackageManifest;
}

function workspaceManifests(): Array<PackageManifest & { directory: string }> {
	const manifests = [
		{
			...readManifest(join(WORKSPACE_ROOT, "package.json")),
			directory: WORKSPACE_ROOT,
		},
	];
	for (const directory of ["packages", "apps", "tooling"]) {
		const parent = join(WORKSPACE_ROOT, directory);
		for (const entry of readdirSync(parent, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const packageJson = join(parent, entry.name, "package.json");
			if (existsSync(packageJson))
				manifests.push({
					...readManifest(packageJson),
					directory: dirname(packageJson),
				});
		}
	}
	return manifests;
}

const manifests = workspaceManifests();

const sourcePaths: Record<string, string[]> = {};
for (const manifest of manifests) {
	if (!manifest.name?.startsWith("@choros/")) continue;
	for (const [key, entry] of Object.entries(manifest.exports ?? {})) {
		const target =
			typeof entry === "string" ? entry : (entry.types ?? entry.default);
		if (target && /\.tsx?$/.test(target)) {
			sourcePaths[manifest.name + (key === "." ? "" : key.slice(1))] = [
				resolve(manifest.directory, target),
			];
		}
	}
}

function dependencyName(specifier: string): string | undefined {
	if (specifier.startsWith(".")) return undefined;
	if (specifier.startsWith("node:")) return "@types/node";
	const parts = specifier.split("/");
	return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function declarationDependencies(declaration: string): Record<string, string> {
	const names = new Set<string>();
	const modulePattern = /(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g;
	for (const match of declaration.matchAll(modulePattern)) {
		const name = dependencyName(match[1]);
		if (name) names.add(name);
	}
	const typeReferencePattern = /<reference\s+types=["']([^"']+)["']/g;
	for (const match of declaration.matchAll(typeReferencePattern)) {
		const reference = match[1];
		const name = reference.startsWith("@")
			? `@types/${reference.slice(1).replace("/", "__")}`
			: `@types/${reference}`;
		names.add(name);
	}

	const dependencies: Record<string, string> = {};
	for (const name of [...names].sort()) {
		if (name.startsWith("@choros/")) {
			throw new Error(
				`Private workspace type escaped declaration bundle: ${name}`,
			);
		}
		let version: string | undefined;
		for (const manifest of manifests) {
			version ??=
				manifest.dependencies?.[name] ??
				manifest.optionalDependencies?.[name] ??
				manifest.peerDependencies?.[name] ??
				manifest.devDependencies?.[name];
		}
		if (!version || version.startsWith("workspace:")) {
			throw new Error(
				`No publishable version found for declaration dependency ${name}`,
			);
		}
		dependencies[name] = version;
	}
	return dependencies;
}

function normalizeDeclarationImports(path: string): void {
	const text = readFileSync(path, "utf8");
	const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
	const replacements: Array<{ start: number; end: number; value: string }> = [];
	const rewrite = (specifier: ts.Expression | undefined) => {
		if (
			!specifier ||
			!ts.isStringLiteral(specifier) ||
			!specifier.text.startsWith(".")
		)
			return;
		const target = resolve(dirname(path), specifier.text);
		const suffix = existsSync(`${target}.d.ts`)
			? ".js"
			: existsSync(join(target, "index.d.ts"))
				? "/index.js"
				: undefined;
		if (suffix)
			replacements.push({
				start: specifier.getStart(source),
				end: specifier.getEnd(),
				value: JSON.stringify(specifier.text + suffix),
			});
	};
	const visit = (node: ts.Node) => {
		if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
			rewrite(node.moduleSpecifier);
		if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
			const literal = node.argument.literal;
			if (ts.isStringLiteral(literal)) rewrite(literal);
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	let output = text;
	for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
		output =
			output.slice(0, replacement.start) +
			replacement.value +
			output.slice(replacement.end);
	}
	// tsc can join a pre-existing Stainless compatibility directive to its
	// declaration; preserve its original next-line scope in the published file.
	output = output.replace(/(\/\*\* @ts-ignore[^\n]*?\*\/) (?=\S)/g, "$1\n");
	if (output !== text) writeFileSync(path, output);
}

console.log(`> cleaning ${DIST}`);
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

console.log("> bun build (ESM)");
execFileSync(
	"bun",
	[
		"build",
		"src/index.ts",
		"--outdir",
		"dist",
		"--target",
		"node",
		"--format",
		"esm",
		"--sourcemap=external",
	],
	{ cwd: ROOT, stdio: "inherit" },
);

console.log("> bun build (CJS)");
execFileSync(
	"bun",
	[
		"build",
		"src/index.ts",
		"--outdir",
		"dist",
		"--target",
		"node",
		"--format",
		"cjs",
		"--sourcemap=external",
		"--entry-naming",
		"[dir]/[name].cjs",
	],
	{ cwd: ROOT, stdio: "inherit" },
);

console.log("> emitting SDK and contract declarations");
const declarationRoot = join(DIST, ".declarations");
const config = ts.readConfigFile(join(ROOT, "tsconfig.json"), ts.sys.readFile);
if (config.error)
	throw new Error(
		ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
	);
const parsedConfig = ts.parseJsonConfigFileContent(
	config.config,
	ts.sys,
	ROOT,
	{
		rootDir: WORKSPACE_ROOT,
		outDir: declarationRoot,
		paths: sourcePaths,
		declaration: true,
		declarationMap: false,
		emitDeclarationOnly: true,
		noEmit: false,
		incremental: false,
	},
);
const program = ts.createProgram(parsedConfig.fileNames, parsedConfig.options);
const diagnostics = [
	...parsedConfig.errors,
	...ts.getPreEmitDiagnostics(program),
	...program.emit().diagnostics,
];
if (diagnostics.length) {
	throw new Error(
		ts.formatDiagnosticsWithColorAndContext(diagnostics, {
			getCurrentDirectory: () => ROOT,
			getCanonicalFileName: (name) => name,
			getNewLine: () => "\n",
		}),
	);
}
cpSync(join(declarationRoot, "packages/sdk/src"), join(DIST, "types"), {
	recursive: true,
});
const declarationPaths = Object.fromEntries(
	Object.entries(sourcePaths).map(([name, paths]) => [
		name,
		paths.map((path) =>
			path.endsWith(".d.ts")
				? path
				: join(declarationRoot, relative(WORKSPACE_ROOT, path)).replace(
						/\.tsx?$/,
						".d.ts",
					),
		),
	]),
);

console.log("> bundling public Host declarations");
const hostDeclaration = join(DIST, "types/local-host/client.d.ts");
const declarationBundle = await rollup({
	input: hostDeclaration,
	external: (specifier) =>
		!specifier.startsWith(".") &&
		!isAbsolute(specifier) &&
		!specifier.startsWith("@choros/"),
	plugins: [
		dts({
			respectExternal: true,
			tsconfig: join(ROOT, "tsconfig.json"),
			compilerOptions: { rootDir: WORKSPACE_ROOT, paths: declarationPaths },
		}),
	],
});
try {
	await declarationBundle.write({ file: hostDeclaration, format: "es" });
} finally {
	await declarationBundle.close();
}
rmSync(declarationRoot, { recursive: true, force: true });
for (const path of new Bun.Glob("**/*.d.ts").scanSync(join(DIST, "types"))) {
	normalizeDeclarationImports(join(DIST, "types", path));
}

const bundledDeclaration = readFileSync(
	join(DIST, "types/local-host/client.d.ts"),
	"utf8",
);
const publishedDependencies = declarationDependencies(bundledDeclaration);

console.log("> copying LICENSE / README / api.md");
for (const f of ["LICENSE", "README.md", "api.md"]) {
	const src = join(ROOT, f);
	if (existsSync(src)) copyFileSync(src, join(DIST, f));
}

console.log("> writing dist/package.json");
const pkg = JSON.parse(
	readFileSync(join(ROOT, "package.json"), "utf-8"),
) as Record<string, unknown>;
const publishName =
	(pkg.publishConfig as { name?: string } | undefined)?.name ??
	(pkg.name as string);

const distPkg = {
	name: publishName,
	version: pkg.version,
	description: pkg.description,
	license: pkg.license,
	type: "module",
	main: "./index.cjs",
	module: "./index.js",
	types: "./types/index.d.ts",
	exports: {
		".": {
			types: "./types/index.d.ts",
			import: "./index.js",
			require: "./index.cjs",
		},
	},
	files: [
		"index.js",
		"index.js.map",
		"index.cjs",
		"index.cjs.map",
		"types",
		"README.md",
		"LICENSE",
		"api.md",
	],
	dependencies: publishedDependencies,
	publishConfig: { access: "public" },
};
writeFileSync(
	join(DIST, "package.json"),
	`${JSON.stringify(distPkg, null, 2)}\n`,
);

console.log("\n✓ build complete");
console.log(`  ${DIST} → ready for: cd dist && npm publish`);
