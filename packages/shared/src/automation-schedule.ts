import type {
	AutomationDefinition,
	AutomationOccurrence,
} from "./automation-contracts";
import { i18n } from "./i18n";
import {
	type CompiledRruleCalendar,
	compileRruleCalendar,
	describeSchedule,
	type RruleCalendarSlot,
	rruleDateToUtc,
	utcToRruleDate,
} from "./rrule";

const MAX_PREVIEW_OCCURRENCES = 5;
const SECOND_MS = 1_000;
const WEEKDAY_BY_NUMBER = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const SUPPORTED_RRULE_KEYS = new Set([
	"FREQ",
	"INTERVAL",
	"BYDAY",
	"BYHOUR",
	"BYMINUTE",
	"BYSECOND",
	"WKST",
]);

type CalendarSchedule = Extract<
	AutomationDefinition["schedule"],
	{ kind: "calendar" }
>;

interface PreparedDefinition {
	endsBefore: number | null;
	calendar: CompiledRruleCalendar | null;
}

interface StrictCalendarRule {
	frequency: "DAILY" | "WEEKLY";
	interval: number;
	byDay: string[];
	hour: number;
	minute: number;
}

function parseInstant(value: string, label: string): number {
	if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
		throw new Error(`${label} must include an explicit UTC offset`);
	}
	const parsed = Date.parse(value);
	if (!Number.isFinite(parsed))
		throw new Error(`${label} must be a valid instant`);
	return parsed;
}

function assertCursor(value: number, label: string): void {
	if (
		!Number.isSafeInteger(value) ||
		!Number.isFinite(new Date(value).getTime())
	) {
		throw new Error(`${label} must be an integer timestamp`);
	}
}

function assertTimeZone(value: string): void {
	try {
		new Intl.DateTimeFormat("en", { timeZone: value }).format();
	} catch {
		throw new Error(`Invalid IANA time zone: ${value}`);
	}
}

function parseUnsignedInteger(value: string, label: string): number {
	if (!/^\d+$/.test(value)) throw new Error(`${label} must be an integer`);
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed))
		throw new Error(`${label} is out of range`);
	return parsed;
}

function parseStrictCalendarRrule(value: string): StrictCalendarRule {
	const parts = new Map<string, string>();
	for (const rawSegment of value.split(";")) {
		const segment = rawSegment.trim();
		const separator = segment.indexOf("=");
		if (!segment || separator <= 0 || separator === segment.length - 1) {
			throw new Error("Calendar RRULE is malformed");
		}
		const key = segment.slice(0, separator).trim().toUpperCase();
		const partValue = segment
			.slice(separator + 1)
			.trim()
			.toUpperCase();
		if (parts.has(key)) throw new Error(`Calendar RRULE repeats ${key}`);
		parts.set(key, partValue);
	}

	if (parts.has("COUNT") || parts.has("UNTIL")) {
		throw new Error(
			"RRULE COUNT and UNTIL are unsupported; use stop.maxRounds and stop.endsBefore",
		);
	}
	for (const key of parts.keys()) {
		if (!SUPPORTED_RRULE_KEYS.has(key)) {
			throw new Error(`Unsupported RRULE field: ${key}`);
		}
	}

	const frequency = parts.get("FREQ");
	if (frequency !== "DAILY" && frequency !== "WEEKLY") {
		throw new Error("RRULE FREQ must be DAILY or WEEKLY");
	}
	const interval = parts.has("INTERVAL")
		? parseUnsignedInteger(parts.get("INTERVAL") as string, "RRULE INTERVAL")
		: 1;
	if (interval < 1) throw new Error("RRULE INTERVAL must be positive");

	const hourValue = parts.get("BYHOUR");
	const minuteValue = parts.get("BYMINUTE");
	if (
		!hourValue ||
		!minuteValue ||
		hourValue.includes(",") ||
		minuteValue.includes(",")
	) {
		throw new Error("RRULE requires one BYHOUR and one BYMINUTE");
	}
	const hour = parseUnsignedInteger(hourValue, "RRULE BYHOUR");
	const minute = parseUnsignedInteger(minuteValue, "RRULE BYMINUTE");
	if (hour > 23) throw new Error("RRULE BYHOUR must be between 0 and 23");
	if (minute > 59) throw new Error("RRULE BYMINUTE must be between 0 and 59");
	if (parts.has("BYSECOND") && parts.get("BYSECOND") !== "0") {
		throw new Error("RRULE BYSECOND only supports 0");
	}
	if (parts.has("WKST") && parts.get("WKST") !== "MO") {
		throw new Error("RRULE WKST only supports MO");
	}

	const byDayValue = parts.get("BYDAY");
	if (frequency === "DAILY" && byDayValue) {
		throw new Error("RRULE BYDAY is only supported with WEEKLY");
	}
	if (frequency === "WEEKLY" && !byDayValue) {
		throw new Error("WEEKLY RRULE requires BYDAY");
	}
	const byDay = byDayValue?.split(",") ?? [];
	if (
		byDay.some((day) => !/^(MO|TU|WE|TH|FR|SA|SU)$/.test(day)) ||
		new Set(byDay).size !== byDay.length
	) {
		throw new Error("RRULE BYDAY requires unique, non-ordinal weekdays");
	}

	return { frequency, interval, byDay, hour, minute };
}

function validateCalendarAnchor(
	schedule: CalendarSchedule,
	rule: StrictCalendarRule,
	startsAt: number,
): void {
	const local = utcToRruleDate(new Date(startsAt), schedule.timeZone);
	if (
		local.getUTCHours() !== rule.hour ||
		local.getUTCMinutes() !== rule.minute ||
		local.getUTCSeconds() !== 0 ||
		local.getUTCMilliseconds() !== 0
	) {
		throw new Error(
			"Calendar startsAt must be a BYHOUR/BYMINUTE slot with zero seconds",
		);
	}
	if (rruleDateToUtc(local, schedule.timeZone).getTime() !== startsAt) {
		throw new Error(
			"Calendar startsAt must use the earlier instant for a repeated local time",
		);
	}
	if (
		rule.frequency === "WEEKLY" &&
		!rule.byDay.includes(WEEKDAY_BY_NUMBER[local.getUTCDay()] as string)
	) {
		throw new Error(
			"Calendar startsAt weekday must be included in RRULE BYDAY",
		);
	}
}

function prepareDefinition(
	definition: AutomationDefinition,
): PreparedDefinition {
	const endsBefore = definition.stop.endsBefore
		? parseInstant(definition.stop.endsBefore, "stop.endsBefore")
		: null;
	const schedule = definition.schedule;
	if (schedule.kind === "immediate") return { endsBefore, calendar: null };

	assertTimeZone(schedule.timeZone);
	if (schedule.kind === "once") {
		parseInstant(schedule.at, "schedule.at");
		return { endsBefore, calendar: null };
	}

	const startsAt = parseInstant(schedule.startsAt, "schedule.startsAt");
	if (schedule.kind === "fixedInterval") {
		if (
			!Number.isSafeInteger(schedule.intervalSeconds) ||
			schedule.intervalSeconds < 60 ||
			!Number.isSafeInteger(schedule.intervalSeconds * SECOND_MS)
		) {
			throw new Error("Fixed intervals must be integer seconds of at least 60");
		}
		return { endsBefore, calendar: null };
	}
	if (schedule.kind === "afterCompletion") {
		if (
			!Number.isSafeInteger(schedule.intervalSeconds) ||
			schedule.intervalSeconds < 0 ||
			!Number.isSafeInteger(schedule.intervalSeconds * SECOND_MS)
		) {
			throw new Error(
				"Completion intervals must be non-negative integer seconds",
			);
		}
		if (schedule.intervalSeconds > 0 && schedule.intervalSeconds < 60) {
			throw new Error("Completion intervals must be 0 or at least 60 seconds");
		}
		if (
			schedule.intervalSeconds === 0 &&
			(!definition.stop.maxRounds || definition.stop.maxRounds > 100)
		) {
			throw new Error(
				"Zero completion intervals require maxRounds between 1 and 100",
			);
		}
		return { endsBefore, calendar: null };
	}

	const rule = parseStrictCalendarRrule(schedule.rrule);
	validateCalendarAnchor(schedule, rule, startsAt);
	return {
		endsBefore,
		calendar: compileRruleCalendar({
			rrule: schedule.rrule,
			dtstart: new Date(startsAt),
			timezone: schedule.timeZone,
		}),
	};
}

function withinEnd(occurrenceAt: number, endsBefore: number | null): boolean {
	return endsBefore === null || occurrenceAt < endsBefore;
}

function instantOccurrence(kind: string, at: number): AutomationOccurrence {
	return { at: new Date(at).toISOString(), kind: "due", key: `${kind}:${at}` };
}

function fixedIntervalAt(
	startsAt: number,
	intervalMs: number,
	after: number,
): number | null {
	if (after < startsAt) return startsAt;
	const steps = Math.floor((after - startsAt) / intervalMs) + 1;
	const result = startsAt + steps * intervalMs;
	return Number.isSafeInteger(result) &&
		Number.isFinite(new Date(result).getTime())
		? result
		: null;
}

/**
 * Gap keys carry the Host scheduler's opaque advancement cursor. Persist the
 * trailing `:cursor=<epochMs>` value as scheduleCursor; feeding that value to
 * nextAutomationOccurrence moves beyond the nonexistent local slot.
 */
function calendarSlotOccurrence(
	schedule: CalendarSchedule,
	slot: RruleCalendarSlot,
): AutomationOccurrence {
	const identity = `calendar:${schedule.timeZone}:${slot.localTime}`;
	if (!slot.at) {
		return {
			at: null,
			kind: "dst_gap",
			localTime: slot.localTime,
			key: `${identity}:cursor=${slot.nextCursorAt.getTime()}`,
		};
	}
	return {
		at: slot.at.toISOString(),
		kind: "due",
		localTime: slot.localTime,
		key: identity,
	};
}

function calendarOccurrence(
	definition: AutomationDefinition,
	prepared: PreparedDefinition,
	after: number,
): AutomationOccurrence | null {
	const schedule = definition.schedule;
	if (schedule.kind !== "calendar" || !prepared.calendar) return null;
	const slot = prepared.calendar.nextSlotAfter(new Date(after));
	if (!slot) return null;
	const boundaryAt = (slot.at ?? slot.nextCursorAt).getTime();
	if (!withinEnd(boundaryAt, prepared.endsBefore)) return null;
	return calendarSlotOccurrence(schedule, slot);
}

/** Validate schedule semantics that the broad public Zod shape cannot express. */
export function validateAutomationSchedule(
	definition: AutomationDefinition,
): void {
	prepareDefinition(definition);
}

/** Return the first logical occurrence strictly after the supplied cursor. */
export function nextAutomationOccurrence(
	definition: AutomationDefinition,
	after: number,
	lastFinishedAt?: number,
): AutomationOccurrence | null {
	assertCursor(after, "after");
	if (lastFinishedAt !== undefined)
		assertCursor(lastFinishedAt, "lastFinishedAt");
	const prepared = prepareDefinition(definition);
	const schedule = definition.schedule;

	if (schedule.kind === "immediate") return null;
	if (schedule.kind === "once") {
		const at = parseInstant(schedule.at, "schedule.at");
		return at > after && withinEnd(at, prepared.endsBefore)
			? instantOccurrence("once", at)
			: null;
	}
	if (schedule.kind === "calendar") {
		return calendarOccurrence(definition, prepared, after);
	}

	const startsAt = parseInstant(schedule.startsAt, "schedule.startsAt");
	if (schedule.kind === "fixedInterval") {
		const at = fixedIntervalAt(
			startsAt,
			schedule.intervalSeconds * SECOND_MS,
			after,
		);
		return at !== null && withinEnd(at, prepared.endsBefore)
			? instantOccurrence("fixed", at)
			: null;
	}

	const at =
		lastFinishedAt === undefined
			? startsAt
			: Math.max(
					startsAt,
					lastFinishedAt + schedule.intervalSeconds * SECOND_MS,
				);
	return at > after && withinEnd(at, prepared.endsBefore)
		? instantOccurrence("after-completion", at)
		: null;
}

/**
 * Preview at most five occurrences. Calendar previews compile RRULE once and
 * advance gaps using their floating wall cursor, not their null instant.
 */
export function previewAutomationOccurrences(
	definition: AutomationDefinition,
	after: number,
	count: number,
	lastFinishedAt?: number,
): AutomationOccurrence[] {
	assertCursor(after, "after");
	if (lastFinishedAt !== undefined)
		assertCursor(lastFinishedAt, "lastFinishedAt");
	if (!Number.isInteger(count) || count < 0) {
		throw new Error("count must be a non-negative integer");
	}
	const limit = Math.min(count, MAX_PREVIEW_OCCURRENCES);
	if (limit === 0) return [];
	const prepared = prepareDefinition(definition);
	const schedule = definition.schedule;

	if (schedule.kind === "calendar" && prepared.calendar) {
		const results: AutomationOccurrence[] = [];
		for (const slot of prepared.calendar.slotsAfter(new Date(after), limit)) {
			const boundaryAt = (slot.at ?? slot.nextCursorAt).getTime();
			if (!withinEnd(boundaryAt, prepared.endsBefore)) break;
			results.push(calendarSlotOccurrence(schedule, slot));
		}
		return results;
	}

	const results: AutomationOccurrence[] = [];
	let cursor = after;
	while (results.length < limit) {
		const occurrence = nextAutomationOccurrence(
			definition,
			cursor,
			lastFinishedAt,
		);
		if (!occurrence) break;
		results.push(occurrence);
		if (!occurrence.at || schedule.kind === "afterCompletion") break;
		cursor = Date.parse(occurrence.at);
	}
	return results;
}

export function describeAutomationSchedule(
	definition: AutomationDefinition,
): string {
	prepareDefinition(definition);
	const schedule = definition.schedule;
	switch (schedule.kind) {
		case "immediate":
			return i18n._({
				id: "shared.automationSchedule.immediate",
				message: "Immediately",
			});
		case "once":
			return i18n._({
				id: "shared.automationSchedule.once",
				message: "Once at {at} ({timeZone})",
				values: { at: schedule.at, timeZone: schedule.timeZone },
			});
		case "calendar":
			return i18n._({
				id: "shared.automationSchedule.calendar",
				message: "{schedule} ({timeZone})",
				values: {
					schedule: describeSchedule(schedule.rrule),
					timeZone: schedule.timeZone,
				},
			});
		case "fixedInterval":
			return i18n._({
				id: "shared.automationSchedule.fixedInterval",
				message: "Every {seconds} seconds from {startsAt}",
				values: {
					seconds: schedule.intervalSeconds,
					startsAt: schedule.startsAt,
				},
			});
		case "afterCompletion":
			return schedule.intervalSeconds === 0
				? i18n._({
						id: "shared.automationSchedule.afterCompletionContinuous",
						message: "Continue after completion from {startsAt}",
						values: { startsAt: schedule.startsAt },
					})
				: i18n._({
						id: "shared.automationSchedule.afterCompletion",
						message: "Wait {seconds} seconds after completion from {startsAt}",
						values: {
							seconds: schedule.intervalSeconds,
							startsAt: schedule.startsAt,
						},
					});
	}
}
