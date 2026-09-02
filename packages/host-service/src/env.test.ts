import { afterAll, describe, expect, test } from "bun:test";

const originalEnv = {
	AUTH_TOKEN: process.env.AUTH_TOKEN,
	HOST_DB_PATH: process.env.HOST_DB_PATH,
	HOST_MIGRATIONS_FOLDER: process.env.HOST_MIGRATIONS_FOLDER,
	HOST_SERVICE_SECRET: process.env.HOST_SERVICE_SECRET,
	ORGANIZATION_ID: process.env.ORGANIZATION_ID,
	PORT: process.env.PORT,
	CHOROS_API_URL: process.env.CHOROS_API_URL,
	CHOROS_AUTH_CONFIG_PATH: process.env.CHOROS_AUTH_CONFIG_PATH,
};

process.env.AUTH_TOKEN = "access-token";
process.env.HOST_DB_PATH = "/tmp/choros-host.db";
process.env.HOST_MIGRATIONS_FOLDER = "/tmp/choros-migrations";
process.env.HOST_SERVICE_SECRET = "host-secret";
process.env.ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
process.env.PORT = "4879";
process.env.CHOROS_API_URL = "https://api.choros.test";
delete process.env.CHOROS_AUTH_CONFIG_PATH;

const { env } = await import("./env");

afterAll(() => {
	for (const [key, value] of Object.entries(originalEnv)) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
});

describe("host-service env", () => {
	test("CHOROS_AUTH_CONFIG_PATH is optional", () => {
		expect(env.CHOROS_AUTH_CONFIG_PATH).toBeUndefined();
		expect(env.AUTH_TOKEN).toBe("access-token");
	});
});
