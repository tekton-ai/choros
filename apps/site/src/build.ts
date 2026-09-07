import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	handlePublicSiteRequest,
	PUBLIC_SITE_ASSETS,
	PUBLIC_SITE_PATHS,
	PUBLIC_SITE_REDIRECTS,
} from "./site";

const outputDirectory = path.resolve(import.meta.dir, "../dist");
const basePath = normalizeBasePath(process.env.SITE_BASE_PATH ?? "/choros");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const [pathname, source] of PUBLIC_SITE_ASSETS) {
	const outputPath = path.join(outputDirectory, pathname.slice(1));
	await mkdir(path.dirname(outputPath), { recursive: true });
	await copyFile(source, outputPath);
}

for (const pathname of PUBLIC_SITE_PATHS) {
	const response = handlePublicSiteRequest(pathname);
	if (!response.ok) {
		throw new Error(`Cannot build ${pathname}: HTTP ${response.status}`);
	}
	await writePage(
		pathname,
		await withBasePath(await response.text(), basePath),
	);
}

for (const [pathname, target] of PUBLIC_SITE_REDIRECTS) {
	await writePage(
		pathname,
		await withBasePath(redirectPage(target, basePath), basePath),
	);
}

const notFound = handlePublicSiteRequest("/__not-found__");
await writeFile(
	path.join(outputDirectory, "404.html"),
	await withBasePath(await notFound.text(), basePath),
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

async function withBasePath(html: string, prefix: string): Promise<string> {
	if (!prefix) return html;

	const rewriter = new HTMLRewriter();
	for (const attribute of ["href", "src"]) {
		rewriter.on(`[${attribute}]`, {
			element(element) {
				const value = element.getAttribute(attribute);
				if (value?.startsWith("/") && !value.startsWith("//")) {
					element.setAttribute(attribute, `${prefix}${value}`);
				}
			},
		});
	}
	rewriter.on("img[srcset], source[srcset]", {
		element(element) {
			const value = element.getAttribute("srcset");
			if (!value) return;

			// These authored candidates contain fixed image paths and descriptors,
			// not data URLs or arbitrary user input.
			element.setAttribute(
				"srcset",
				value.replace(
					/(^|,)(\s*)(\/(?!\/)[^\s,]*)/g,
					(_, separator, whitespace, url) =>
						`${separator}${whitespace}${prefix}${url}`,
				),
			);
		},
	});
	return rewriter.transform(new Response(html)).text();
}

function redirectPage(target: string, prefix: string): string {
	const destination = Bun.escapeHTML(`${prefix}${target}`);
	const href = Bun.escapeHTML(target);
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${destination}"><link rel="canonical" href="${href}"><title>Redirecting · Choros</title></head><body><p>Redirecting to <a href="${href}">${destination}</a>…</p></body></html>`;
}
