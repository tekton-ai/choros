import { afterAll, describe, expect, test } from "bun:test";

const originalEnv = {
	HOST_DB_PATH: process.env.HOST_DB_PATH,
	HOST_MIGRATIONS_FOLDER: process.env.HOST_MIGRATIONS_FOLDER,
	HOST_SERVICE_SECRET: process.env.HOST_SERVICE_SECRET,
	PORT: process.env.PORT,
};

process.env.HOST_DB_PATH = "/tmp/choros-host.db";
process.env.HOST_MIGRATIONS_FOLDER = "/tmp/choros-migrations";
process.env.HOST_SERVICE_SECRET = "host-secret";
process.env.PORT = "4879";

// Intentionally import after setting process.env; static import hoisting would
// evaluate the env singleton before this test can establish its boundary.
const { env } = await import("./env");

afterAll(() => {
	for (const [key, value] of Object.entries(originalEnv)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

describe("host-service env", () => {
	test("requires only local host configuration", () => {
		expect(env.HOST_DB_PATH).toBe("/tmp/choros-host.db");
		expect(env.HOST_MIGRATIONS_FOLDER).toBe("/tmp/choros-migrations");
		expect(env.HOST_SERVICE_SECRET).toBe("host-secret");
		expect(env.PORT).toBe(4879);
	});
});
