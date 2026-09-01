import { describe, expect, it } from "bun:test";

import { getTrustedVercelPreviewOrigins } from "./vercel-preview-origins";

describe("getTrustedVercelPreviewOrigins", () => {
	it("returns sibling preview origins for API preview deployments", () => {
		expect(
			getTrustedVercelPreviewOrigins("https://api-pr-2837-choros.vercel.app"),
		).toEqual([
			"https://web-pr-2837-choros.vercel.app",
			"https://admin-pr-2837-choros.vercel.app",
			"https://marketing-pr-2837-choros.vercel.app",
		]);
	});

	it("returns sibling preview origins for branch preview deployments", () => {
		expect(
			getTrustedVercelPreviewOrigins(
				"https://api-git-add-security-headers-choros.vercel.app",
			),
		).toEqual([
			"https://web-git-add-security-headers-choros.vercel.app",
			"https://admin-git-add-security-headers-choros.vercel.app",
			"https://marketing-git-add-security-headers-choros.vercel.app",
		]);
	});

	it("ignores non-vercel origins", () => {
		expect(getTrustedVercelPreviewOrigins("https://api.choros.sh")).toEqual([]);
		expect(getTrustedVercelPreviewOrigins("http://localhost:3001")).toEqual([]);
	});
});
