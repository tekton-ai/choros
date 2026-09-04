import { describe, expect, mock, test } from "bun:test";
import { handleUsageEvent, type UsageEventRecord } from "./usage";

const VALID_BODY = {
	id: "01991f5d-6ad0-7f62-a5f1-2cb897cc78ba",
	event: "desktop_opened",
	occurredAt: "2026-09-03T08:00:00.000Z",
	appVersion: "0.1.0",
	platform: "darwin-arm64",
	schemaVersion: 1,
} as const;

function request(body: unknown): Request {
	return new Request("https://auth.example.com/api/usage/events", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("handleUsageEvent", () => {
	test("rejects requests without an authenticated user", async () => {
		const insertEvent = mock(async (_event: UsageEventRecord) => {});
		const response = await handleUsageEvent(request(VALID_BODY), {
			getUserId: async () => null,
			insertEvent,
		});

		expect(response.status).toBe(401);
		expect(insertEvent).not.toHaveBeenCalled();
	});

	test("rejects malformed JSON", async () => {
		const response = await handleUsageEvent(
			new Request("https://auth.example.com/api/usage/events", {
				method: "POST",
				body: "{",
			}),
			{
				getUserId: async () => "user-1",
				insertEvent: async () => {},
			},
		);

		expect(response.status).toBe(400);
		expect((await response.json()) as unknown).toEqual({
			code: "INVALID_JSON",
		});
	});

	test("rejects unknown fields including a client-supplied user id", async () => {
		const insertEvent = mock(async (_event: UsageEventRecord) => {});
		const response = await handleUsageEvent(
			request({ ...VALID_BODY, userId: "attacker" }),
			{
				getUserId: async () => "verified-user",
				insertEvent,
			},
		);

		expect(response.status).toBe(400);
		expect(insertEvent).not.toHaveBeenCalled();
	});

	test("rejects event names outside the single-event contract", async () => {
		const response = await handleUsageEvent(
			request({ ...VALID_BODY, event: "workspace_opened" }),
			{
				getUserId: async () => "user-1",
				insertEvent: async () => {},
			},
		);

		expect(response.status).toBe(400);
	});

	test("rejects malformed fixed fields", async () => {
		const insertEvent = mock(async (_event: UsageEventRecord) => {});
		for (const body of [
			{ ...VALID_BODY, id: "not-a-uuid" },
			{ ...VALID_BODY, appVersion: "latest" },
			{ ...VALID_BODY, platform: "browser" },
		]) {
			const response = await handleUsageEvent(request(body), {
				getUserId: async () => "user-1",
				insertEvent,
			});
			expect(response.status).toBe(400);
		}
		expect(insertEvent).not.toHaveBeenCalled();
	});

	test("derives the user from the session and inserts the fixed record", async () => {
		const insertEvent = mock(async (_event: UsageEventRecord) => {});
		const response = await handleUsageEvent(request(VALID_BODY), {
			getUserId: async () => "verified-user",
			insertEvent,
		});

		expect(response.status).toBe(204);
		expect(insertEvent).toHaveBeenCalledTimes(1);
		expect(insertEvent.mock.calls[0]?.[0]).toEqual({
			...VALID_BODY,
			userId: "verified-user",
			occurredAt: new Date(VALID_BODY.occurredAt),
		});
	});
});
