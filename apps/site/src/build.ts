import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	handlePublicSiteRequest,
	PUBLIC_SITE_PATHS,
	PUBLIC_SITE_REDIRECTS,
} from "./site";

const outputDirectory = path.resolve(import.meta.dir, "../dist");
const basePath = normalizeBasePath(process.env.SITE_BASE_PATH ?? "/choros");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const pathname of PUBLIC_SITE_PATHS) {
	const response = handlePublicSiteRequest(pathname);
	if (!response.ok) {
		throw new Error(`Cannot build ${pathname}: HTTP ${response.status}`);
	}
	await writePage(pathname, withBasePath(await response.text(), basePath));
}

for (const [pathname, target] of PUBLIC_SITE_REDIRECTS) {
	await writePage(pathname, redirectPage(`${basePath}${target}`));
}

const notFound = handlePublicSiteRequest("/__not-found__");
await writeFile(
	path.join(outputDirectory, "404.html"),
	withBasePath(await notFound.text(), basePath),
);
await writeFile(path.join(outputDirectory, ".nojekyll"), "");

console.log(
	`Built ${PUBLIC_SITE_PATHS.size} pages and ${PUBLIC_SITE_REDIRECTS.size} redirects in ${outputDirectory}`,
);

async function writePage(pathname: string, content: string): Promise<void> {
	const relativePath =
		pathname === "/" ? "index.html" : `${pathname.slice(1)}/index.html`;
	const outputPath = path.join(outputDirectory, relativePath);
	await mkdir(path.dirname(outputPath), { recursive: true });
	await writeFile(outputPath, content);
}

function normalizeBasePath(value: string): string {
	if (!value || value === "/") return "";
	return `/${value.replace(/^\/+|\/+$/g, "")}`;
}

function withBasePath(html: string, prefix: string): string {
	if (!prefix) return html;
	return html.replaceAll('href="/', `href="${prefix}/`);
}

function redirectPage(target: string): string {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${target}"><link rel="canonical" href="${target}"><title>Redirecting · Choros</title></head><body><p>Redirecting to <a href="${target}">${target}</a>…</p></body></html>`;
}
