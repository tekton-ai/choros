import { describe, expect, it } from "bun:test";
import type {
	AutomationDefinition,
	AutomationOccurrence,
} from "./automation-contracts";
import {
	describeAutomationSchedule,
	nextAutomationOccurrence,
	previewAutomationOccurrences,
	validateAutomationSchedule,
} from "./automation-schedule";

function definition(
	schedule: AutomationDefinition["schedule"],
	stop: AutomationDefinition["stop"] = {},
): AutomationDefinition {
	return {
		name: "Schedule regression",
		instructions: "Exercise the shared schedule calculator.",
		target: {
			kind: "existingWorkspace",
			workspaceId: "018f47c0-6744-7a12-b0a4-4ab0d135af31",
			setupPolicy: "prepared",
		},
		executor: {
			harness: "codex",
			accountRef: "test-account",
			sessionMode: "fresh",
		},
		schedule,
		stop,
		missedRunWindowSeconds: 3600,
		setupTimeoutSeconds: 600,
	};
}

const DAILY_0230 = "FREQ=DAILY;BYHOUR=2;BYMINUTE=30;BYSECOND=0;WKST=MO";
const DAILY_0130 = "FREQ=DAILY;BYHOUR=1;BYMINUTE=30";

describe("calendar DST slots", () => {
	it("returns and advances the New York spring gap without moving the slot", () => {
		const value = definition({
			kind: "calendar",
			rrule: DAILY_0230,
			startsAt: "2026-03-07T07:30:00.000Z",
			timeZone: "America/New_York",
		});
		const after = Date.parse("2026-03-07T07:30:00.000Z");
		const occurrences = previewAutomationOccurrences(value, after, 3);

		expect(occurrences).toEqual([
			{
				at: null,
				kind: "dst_gap",
				localTime: "2026-03-08T02:30:00",
				key: expect.stringMatching(
					/^calendar:America\/New_York:2026-03-08T02:30:00:cursor=\d+$/,
				),
			},
			{
				at: "2026-03-09T06:30:00.000Z",
				kind: "due",
				localTime: "2026-03-09T02:30:00",
				key: "calendar:America/New_York:2026-03-09T02:30:00",
			},
			{
				at: "2026-03-10T06:30:00.000Z",
				kind: "due",
				localTime: "2026-03-10T02:30:00",
				key: "calendar:America/New_York:2026-03-10T02:30:00",
			},
		]);

		const gap = occurrences[0];
		const cursor = Number(gap?.key.match(/:cursor=(\d+)$/)?.[1]);
		expect(nextAutomationOccurrence(value, cursor)).toEqual(occurrences[1]);
	});

	it("chooses the earlier New York fall-fold instant", () => {
		const value = definition({
			kind: "calendar",
			rrule: DAILY_0130,
			startsAt: "2026-10-31T05:30:00.000Z",
			timeZone: "America/New_York",
		});

		expect(
			nextAutomationOccurrence(value, Date.parse("2026-10-31T05:30:00.000Z")),
		).toMatchObject({
			at: "2026-11-01T05:30:00.000Z",
			kind: "due",
			localTime: "2026-11-01T01:30:00",
		});
	});

	it("does not read the Host process timezone", () => {
		const previous = process.env.TZ;
		process.env.TZ = "Asia/Tokyo";
		try {
			const value = definition({
				kind: "calendar",
				rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=15",
				startsAt: "2026-01-01T14:15:00.000Z",
				timeZone: "America/New_York",
			});
			expect(
				nextAutomationOccurrence(value, Date.parse("2026-01-01T14:15:00.000Z"))
					?.at,
			).toBe("2026-01-02T14:15:00.000Z");
		} finally {
			if (previous === undefined) delete process.env.TZ;
			else process.env.TZ = previous;
		}
	});

	it("includes startsAt when the cursor is strictly before it", () => {
		const value = definition({
			kind: "calendar",
			rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;BYHOUR=9;BYMINUTE=0;WKST=MO",
			startsAt: "2026-09-28T09:00:00.000Z",
			timeZone: "UTC",
		});
		expect(
			nextAutomationOccurrence(value, Date.parse("2026-09-28T08:59:59.999Z"))
				?.at,
		).toBe("2026-09-28T09:00:00.000Z");
	});
});

describe("elapsed and completion intervals", () => {
	it("uses integer elapsed time across the New York DST boundary", () => {
		const value = definition({
			kind: "fixedInterval",
			startsAt: "2026-03-08T06:30:00.000Z",
			intervalSeconds: 3600,
			timeZone: "America/New_York",
		});
		expect(
			previewAutomationOccurrences(
				value,
				Date.parse("2026-03-08T06:29:59.999Z"),
				3,
			).map((occurrence) => occurrence.at),
		).toEqual([
			"2026-03-08T06:30:00.000Z",
			"2026-03-08T07:30:00.000Z",
			"2026-03-08T08:30:00.000Z",
		]);
	});

	it("treats endsBefore as an exclusive upper bound", () => {
		const value = definition(
			{
				kind: "fixedInterval",
				startsAt: "2026-09-28T09:00:00.000Z",
				intervalSeconds: 600,
				timeZone: "UTC",
			},
			{ endsBefore: "2026-09-28T09:20:00.000Z" },
		);
		expect(
			previewAutomationOccurrences(
				value,
				Date.parse("2026-09-28T08:00:00.000Z"),
				5,
			).map((occurrence) => occurrence.at),
		).toEqual(["2026-09-28T09:00:00.000Z", "2026-09-28T09:10:00.000Z"]);
	});

	it("does not invent completion-relative occurrences without a finish anchor", () => {
		const value = definition({
			kind: "afterCompletion",
			startsAt: "2026-09-28T09:00:00.000Z",
			intervalSeconds: 600,
			timeZone: "UTC",
		});
		expect(
			previewAutomationOccurrences(
				value,
				Date.parse("2026-09-28T08:00:00.000Z"),
				5,
			),
		).toHaveLength(1);
		expect(
			nextAutomationOccurrence(value, Date.parse("2026-09-28T09:00:00.000Z")),
		).toBeNull();
		expect(
			nextAutomationOccurrence(
				value,
				Date.parse("2026-09-28T09:00:00.000Z"),
				Date.parse("2026-09-28T09:07:00.000Z"),
			)?.at,
		).toBe("2026-09-28T09:17:00.000Z");
	});
});

describe("one-shot and preview boundaries", () => {
	it("applies the strict-after rule to once and never schedules immediate", () => {
		const once = definition({
			kind: "once",
			at: "2026-09-28T09:00:00.000Z",
			timeZone: "UTC",
		});
		expect(
			nextAutomationOccurrence(once, Date.parse("2026-09-28T08:59:59.999Z"))
				?.at,
		).toBe("2026-09-28T09:00:00.000Z");
		expect(
			nextAutomationOccurrence(once, Date.parse("2026-09-28T09:00:00.000Z")),
		).toBeNull();
		expect(
			nextAutomationOccurrence(
				definition({ kind: "immediate" }),
				Date.parse("2026-09-28T08:00:00.000Z"),
			),
		).toBeNull();
	});

	it("caps previews at five and agrees with repeated next calculations", () => {
		const value = definition({
			kind: "fixedInterval",
			startsAt: "2026-09-28T09:00:00.000Z",
			intervalSeconds: 60,
			timeZone: "UTC",
		});
		const after = Date.parse("2026-09-28T08:00:00.000Z");
		const preview = previewAutomationOccurrences(value, after, 20);
		const repeated: AutomationOccurrence[] = [];
		let cursor = after;
		for (let index = 0; index < 5; index++) {
			const occurrence = nextAutomationOccurrence(value, cursor);
			if (!occurrence?.at) break;
			repeated.push(occurrence);
			cursor = Date.parse(occurrence.at);
		}
		expect(preview).toEqual(repeated);
		expect(preview).toHaveLength(5);
	});
});

describe("strict Automation RRULE subset", () => {
	it("rejects unsupported or lossy fields instead of ignoring them", () => {
		const invalid = [
			"FREQ=MONTHLY;BYHOUR=9;BYMINUTE=0",
			"FREQ=DAILY;BYHOUR=9;BYMINUTE=0;COUNT=2",
			"FREQ=DAILY;BYHOUR=9;BYMINUTE=0;UNTIL=20261001T000000Z",
			"FREQ=DAILY;BYHOUR=9;BYMINUTE=0;COUNT=2;UNTIL=20261001T000000Z",
			"FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSETPOS=1",
			"FREQ=WEEKLY;BYDAY=1MO;BYHOUR=9;BYMINUTE=0",
			"FREQ=WEEKLY;BYHOUR=9;BYMINUTE=0",
			"FREQ=DAILY;BYHOUR=9,10;BYMINUTE=0",
		];
		for (const rrule of invalid) {
			expect(() =>
				validateAutomationSchedule(
					definition({
						kind: "calendar",
						rrule,
						startsAt: "2026-09-28T09:00:00.000Z",
						timeZone: "UTC",
					}),
				),
			).toThrow();
		}
	});

	it("rejects invalid IANA zones and anchor/rule mismatches", () => {
		expect(() =>
			validateAutomationSchedule(
				definition({
					kind: "calendar",
					rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
					startsAt: "2026-09-28T09:00:00.000Z",
					timeZone: "Not/AZone",
				}),
			),
		).toThrow("Invalid IANA time zone");
		expect(() =>
			validateAutomationSchedule(
				definition({
					kind: "calendar",
					rrule: "FREQ=DAILY;BYHOUR=10;BYMINUTE=0",
					startsAt: "2026-09-28T09:00:00.000Z",
					timeZone: "UTC",
				}),
			),
		).toThrow("startsAt");
	});

	it("uses the existing RRULE description for valid calendar schedules", () => {
		const value = definition({
			kind: "calendar",
			rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0",
			startsAt: "2026-09-28T09:00:00.000Z",
			timeZone: "UTC",
		});
		expect(describeAutomationSchedule(value)).toContain("UTC");
	});
});
