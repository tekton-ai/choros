import { describe, expect, it } from "bun:test";
import { parseChorosPageUrl } from "./parseChorosPageUrl";

const WEB_URL = "https://app.choros.sh";

describe("parseChorosPageUrl", () => {
	it("extracts the slug from a page URL on the web origin", () => {
		expect(
			parseChorosPageUrl(`${WEB_URL}/page/quarterly-report-a3f9k2`, WEB_URL),
		).toBe("quarterly-report-a3f9k2");
	});

	it("tolerates a trailing slash", () => {
		expect(
			parseChorosPageUrl(`${WEB_URL}/page/report-a3f9k2/`, WEB_URL),
		).toBe("report-a3f9k2");
	});

	it("ignores query strings and hashes", () => {
		expect(
			parseChorosPageUrl(`${WEB_URL}/page/report-a3f9k2?v=2#top`, WEB_URL),
		).toBe("report-a3f9k2");
	});

	it("tolerates a trailing slash on the configured web URL", () => {
		expect(
			parseChorosPageUrl(`${WEB_URL}/page/report-a3f9k2`, `${WEB_URL}/`),
		).toBe("report-a3f9k2");
	});

	it("rejects a different origin", () => {
		expect(
			parseChorosPageUrl(
				"https://evil.example.com/page/report-a3f9k2",
				WEB_URL,
			),
		).toBeNull();
	});

	it("rejects a different scheme on the same host", () => {
		expect(
			parseChorosPageUrl(
				"http://app.choros.sh/page/report-a3f9k2",
				WEB_URL,
			),
		).toBeNull();
	});

	it("rejects non-page paths", () => {
		expect(parseChorosPageUrl(`${WEB_URL}/pages/report`, WEB_URL)).toBeNull();
		expect(parseChorosPageUrl(`${WEB_URL}/tasks/report`, WEB_URL)).toBeNull();
		expect(parseChorosPageUrl(WEB_URL, WEB_URL)).toBeNull();
	});

	it("rejects a page path with no slug", () => {
		expect(parseChorosPageUrl(`${WEB_URL}/page`, WEB_URL)).toBeNull();
		expect(parseChorosPageUrl(`${WEB_URL}/page/`, WEB_URL)).toBeNull();
	});

	it("rejects nested paths under a page", () => {
		expect(
			parseChorosPageUrl(`${WEB_URL}/page/report-a3f9k2/edit`, WEB_URL),
		).toBeNull();
	});

	it("decodes percent-encoded slugs", () => {
		expect(parseChorosPageUrl(`${WEB_URL}/page/a%20b-a3f9k2`, WEB_URL)).toBe(
			"a b-a3f9k2",
		);
	});

	it("returns null for text that is not a URL", () => {
		expect(parseChorosPageUrl("not a url", WEB_URL)).toBeNull();
		expect(parseChorosPageUrl("", WEB_URL)).toBeNull();
	});
});
