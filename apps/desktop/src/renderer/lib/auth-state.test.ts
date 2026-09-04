import { describe, expect, it } from "bun:test";
import { canEnterLocalProduct } from "./auth-state";

describe("canEnterLocalProduct", () => {
	it("allows a live session", () => {
		expect(
			canEnterLocalProduct({
				hasSession: true,
				hasStoredToken: false,
				skipValidation: false,
			}),
		).toBe(true);
	});

	it("allows a previously authenticated installation while the service is unavailable", () => {
		expect(
			canEnterLocalProduct({
				hasSession: false,
				hasStoredToken: true,
				skipValidation: false,
			}),
		).toBe(true);
	});

	it("requires first-time authentication", () => {
		expect(
			canEnterLocalProduct({
				hasSession: false,
				hasStoredToken: false,
				skipValidation: false,
			}),
		).toBe(false);
	});
});
