import { describe, expect, it } from "bun:test";
import {
	eventBody,
	type PendingUsageEvent,
	readPendingUsageEvents,
	writePendingUsageEvents,
} from "./queue";

function usageEvent(id: string): PendingUsageEvent {
	return {
		id,
		userId: "user-1",
		event: "desktop_opened",
		occurredAt: "2026-09-03T08:00:00.000Z",
		appVersion: "0.1.0",
		platform: "darwin-arm64",
		schemaVersion: 1,
	};
}

describe("UsageReporter queue", () => {
	it("removes the local user binding from the network body", () => {
		expect(eventBody(usageEvent("event-1"))).toEqual({
			id: "event-1",
			event: "desktop_opened",
			occurredAt: "2026-09-03T08:00:00.000Z",
			appVersion: "0.1.0",
			platform: "darwin-arm64",
			schemaVersion: 1,
		});
	});

	it("ignores corrupt and unsupported queued records", () => {
		const storage = {
			getItem: () => JSON.stringify([usageEvent("valid"), { event: "other" }]),
		};
		expect(readPendingUsageEvents(storage)).toEqual([usageEvent("valid")]);
	});

	it("bounds offline launches to the newest 100 events", () => {
		let serialized = "";
		writePendingUsageEvents(
			{ setItem: (_key, value) => (serialized = value) },
			Array.from({ length: 105 }, (_, index) => usageEvent(String(index))),
		);
		const written = JSON.parse(serialized) as PendingUsageEvent[];
		expect(written).toHaveLength(100);
		expect(written[0]?.id).toBe("5");
		expect(written.at(-1)?.id).toBe("104");
	});
});
