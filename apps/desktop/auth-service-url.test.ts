import { describe, expect, test } from "bun:test";
import {
	DEFAULT_AUTH_SERVICE_URL,
	resolveAuthServiceUrl,
} from "./auth-service-url";

describe("resolveAuthServiceUrl", () => {
	test("uses the deployed Worker when no URL is configured", () => {
		expect(resolveAuthServiceUrl(undefined)).toBe(DEFAULT_AUTH_SERVICE_URL);
	});

	test("replaces the retired api.choros.sh origin", () => {
		expect(resolveAuthServiceUrl("https://api.choros.sh")).toBe(
			DEFAULT_AUTH_SERVICE_URL,
		);
	});

	test("keeps an explicit local auth server", () => {
		expect(resolveAuthServiceUrl("http://localhost:3001")).toBe(
			"http://localhost:3001",
		);
	});
});
