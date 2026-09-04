import { describe, expect, test } from "bun:test";
import { handlePublicSiteRequest, PUBLIC_SITE_PATHS } from "./site";

describe("public Choros site", () => {
	test("serves every canonical public path", async () => {
		for (const pathname of PUBLIC_SITE_PATHS) {
			const response = handlePublicSiteRequest(pathname);
			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe(
				"text/html; charset=utf-8",
			);
			expect(await response.text()).toContain("CHOROS");
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

	test("returns a real 404 page for unknown paths", async () => {
		const response = handlePublicSiteRequest("/docs/not-a-page");
		expect(response.status).toBe(404);
		expect(await response.text()).toContain("Page not found");
	});

	test("sets restrictive browser security headers", () => {
		const response = handlePublicSiteRequest("/");
		expect(response.headers.get("content-security-policy")).toContain(
			"frame-ancestors 'none'",
		);
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
	});
});
