import { describe, expect, test } from "bun:test";
import { handlePublicSiteRequest, PUBLIC_SITE_PATHS } from "./site";

describe("public Choros site", () => {
	test("serves every canonical public path", () => {
		for (const pathname of PUBLIC_SITE_PATHS) {
			const response = handlePublicSiteRequest(pathname);
			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe(
				"text/html; charset=utf-8",
			);
		}
	});

	test("keeps legacy public paths on the canonical origin", () => {
		const app = handlePublicSiteRequest("/app");
		expect(app.status).toBe(308);
		expect(app.headers.get("location")).toBe("/");

		const themes = handlePublicSiteRequest("/marketplace/themes");
		expect(themes.status).toBe(308);
		expect(themes.headers.get("location")).toBe("/docs/custom-themes");

		const ports = handlePublicSiteRequest("/docs/ports");
		expect(ports.status).toBe(308);
		expect(ports.headers.get("location")).toBe("/docs/setup-teardown-scripts");
	});

	test("returns a real 404 page for unknown paths", () => {
		const response = handlePublicSiteRequest("/docs/not-a-page");
		expect(response.status).toBe(404);
		expect(response.headers.get("content-type")).toBe(
			"text/html; charset=utf-8",
		);
	});

	test("serves the public logo as SVG rather than an HTML fallback", async () => {
		const response = handlePublicSiteRequest("/assets/choros-logo-light.svg");
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("image/svg+xml");
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
		expect((await response.text()).trimStart()).toMatch(/^<svg[\s>]/);
	});

	test("serves the motion controller with an executable JavaScript MIME type", () => {
		const response = handlePublicSiteRequest("/assets/site-motion.js");
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe(
			"text/javascript; charset=utf-8",
		);
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
	});

	test.each([
		"/assets/not-a-file.svg",
		"/assets/",
		"/assets/../package.json",
		"/assets/%2e%2e/package.json",
		"/assets/../assets/workspace-overview.svg",
		"/assets/%77orkspace-overview.svg",
		"/assets/workspace-overview.svg/extra",
		"//assets/workspace-overview.svg",
	])("rejects non-allowlisted asset path %s", (pathname) => {
		const response = handlePublicSiteRequest(pathname);
		expect(response.status).toBe(404);
		expect(response.headers.get("content-type")).toBe(
			"text/html; charset=utf-8",
		);
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
	});

	test("sets restrictive browser security headers", () => {
		const response = handlePublicSiteRequest("/");
		expect(response.headers.get("content-security-policy")).toContain(
			"frame-ancestors 'none'",
		);
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
	});
});
