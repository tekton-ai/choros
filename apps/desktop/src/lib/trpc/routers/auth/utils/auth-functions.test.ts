import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const originalHome = process.env.CHOROS_HOME_DIR;
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), "auth-functions-test-"));
process.env.CHOROS_HOME_DIR = testHome;

mock.module("./crypto-storage", () => ({
	encrypt: (value: string) => Buffer.from(value, "utf8"),
	decrypt: (value: Buffer) => value.toString("utf8"),
}));

const { clearToken, handleAuthCallback, loadToken, saveToken, stateStore } =
	await import("./auth-functions");
const tokenFile = path.join(testHome, "auth-token.enc");

beforeEach(() => {
	for (const name of fs.readdirSync(testHome)) {
		fs.rmSync(path.join(testHome, name), { recursive: true, force: true });
	}
	stateStore.clear();
});

afterAll(() => {
	fs.rmSync(testHome, { recursive: true, force: true });
	if (originalHome === undefined) delete process.env.CHOROS_HOME_DIR;
	else process.env.CHOROS_HOME_DIR = originalHome;
});

describe("personal auth token storage", () => {
	test("stores only token and expiry with owner-only permissions", async () => {
		await saveToken({ token: "token", expiresAt: "2099-01-01T00:00:00.000Z" });
		expect(await loadToken()).toEqual({
			token: "token",
			expiresAt: "2099-01-01T00:00:00.000Z",
		});
		expect(fs.statSync(tokenFile).mode & 0o777).toBe(0o600);
		expect(JSON.parse(fs.readFileSync(tokenFile, "utf8"))).toEqual({
			token: "token",
			expiresAt: "2099-01-01T00:00:00.000Z",
		});
	});

	test("reports a missing token", async () => {
		expect(await loadToken()).toEqual({ token: null, expiresAt: null });
	});

	test("quarantines corrupt token storage", async () => {
		fs.writeFileSync(tokenFile, "not json", { mode: 0o600 });
		expect(await loadToken()).toEqual({ token: null, expiresAt: null });
		expect(
			fs
				.readdirSync(testHome)
				.some((name) => name.startsWith("auth-token.enc.corrupt-")),
		).toBe(true);
	});

	test("clears the token without touching other local data", async () => {
		await saveToken({ token: "token", expiresAt: "2099-01-01T00:00:00.000Z" });
		fs.writeFileSync(path.join(testHome, "local.db"), "keep");
		await clearToken();
		expect(fs.existsSync(tokenFile)).toBe(false);
		expect(fs.readFileSync(path.join(testHome, "local.db"), "utf8")).toBe(
			"keep",
		);
	});

	test("accepts a callback only for an issued state", async () => {
		expect(
			await handleAuthCallback({
				token: "token",
				expiresAt: "2099-01-01T00:00:00.000Z",
				state: "unknown",
			}),
		).toEqual({ success: false, error: "Invalid or expired auth session" });
		stateStore.set("issued", Date.now());
		expect(
			await handleAuthCallback({
				token: "token",
				expiresAt: "2099-01-01T00:00:00.000Z",
				state: "issued",
			}),
		).toEqual({ success: true });
	});
});
