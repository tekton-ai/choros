import { describe, expect, test } from "bun:test";
import { createTestHost } from "./helpers/create-test-host";

describe("local-only host service", () => {
	test("boots without cloud identity and serves local routes", async () => {
		const host = await createTestHost();
		try {
			expect(await host.trpc.health.check.query()).toEqual({ status: "ok" });
			const info = await host.trpc.host.info.query();
			expect(info.hostId).toBeTruthy();
			expect(info.hostName).toBeTruthy();
			expect("organization" in info).toBe(false);
			expect(await host.trpc.project.list.query()).toEqual([]);
		} finally {
			await host.dispose();
		}
	});

	test("keeps protected local routes behind the host PSK", async () => {
		const host = await createTestHost();
		try {
			await expect(
				host.unauthenticatedTrpc.project.list.query(),
			).rejects.toThrow();
		} finally {
			await host.dispose();
		}
	});
});
