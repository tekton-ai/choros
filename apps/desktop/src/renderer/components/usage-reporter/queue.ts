export interface PendingUsageEvent {
	id: string;
	userId: string;
	event: "desktop_opened";
	occurredAt: string;
	appVersion: string;
	platform: string;
	schemaVersion: 1;
}

const QUEUE_KEY = "choros:pending-usage-events:v1";
const MAX_PENDING_EVENTS = 100;

export function readPendingUsageEvents(
	storage: Pick<Storage, "getItem">,
): PendingUsageEvent[] {
	try {
		const parsed = JSON.parse(storage.getItem(QUEUE_KEY) ?? "[]");
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(value): value is PendingUsageEvent =>
				typeof value === "object" &&
				value !== null &&
				typeof value.id === "string" &&
				typeof value.userId === "string" &&
				value.event === "desktop_opened" &&
				typeof value.occurredAt === "string" &&
				typeof value.appVersion === "string" &&
				typeof value.platform === "string" &&
				value.schemaVersion === 1,
		);
	} catch {
		return [];
	}
}

export function writePendingUsageEvents(
	storage: Pick<Storage, "setItem">,
	events: PendingUsageEvent[],
): void {
	storage.setItem(QUEUE_KEY, JSON.stringify(events.slice(-MAX_PENDING_EVENTS)));
}

export function eventBody({
	userId: _userId,
	...body
}: PendingUsageEvent): Omit<PendingUsageEvent, "userId"> {
	return body;
}
