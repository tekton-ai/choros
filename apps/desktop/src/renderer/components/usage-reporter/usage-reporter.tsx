import { useEffect, useRef } from "react";
import { env } from "renderer/env.renderer";
import { authClient, getAuthToken } from "renderer/lib/auth-client";
import {
	eventBody,
	type PendingUsageEvent,
	readPendingUsageEvents,
	writePendingUsageEvents,
} from "./queue";

const LAST_USER_KEY = "choros:last-authenticated-user-id";
const launchMarkerKey = () => `choros:usage-launch:${window.App.launchId}`;

function createEvent(userId: string): PendingUsageEvent {
	return {
		id: crypto.randomUUID(),
		userId,
		event: "desktop_opened",
		occurredAt: new Date().toISOString(),
		appVersion: window.App.appVersion,
		platform: `${window.App.platform}-${window.App.arch}`,
		schemaVersion: 1,
	};
}

async function flushForUser(userId: string): Promise<void> {
	const token = getAuthToken();
	if (!token) return;
	const pending = readPendingUsageEvents(window.localStorage);
	const retained: PendingUsageEvent[] = [];
	let failed = false;
	for (const event of pending) {
		if (event.userId !== userId || failed) {
			retained.push(event);
			continue;
		}
		try {
			const response = await fetch(
				`${env.NEXT_PUBLIC_API_URL}/api/usage/events`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(eventBody(event)),
					keepalive: true,
				},
			);
			if (!response.ok) {
				failed = true;
				retained.push(event);
			}
		} catch {
			failed = true;
			retained.push(event);
		}
	}
	writePendingUsageEvents(window.localStorage, retained);
}

export function UsageReporter() {
	const { data: session } = authClient.useSession();
	const recorded = useRef(false);
	const sessionUserId = session?.user?.id ?? null;
	const reportingEnabled = env.NODE_ENV === "production";

	useEffect(() => {
		if (!reportingEnabled) return;
		if (sessionUserId) {
			window.localStorage.setItem(LAST_USER_KEY, sessionUserId);
		}
		const userId =
			sessionUserId ?? window.localStorage.getItem(LAST_USER_KEY) ?? null;
		if (
			!recorded.current &&
			userId &&
			!window.localStorage.getItem(launchMarkerKey())
		) {
			recorded.current = true;
			window.localStorage.setItem(launchMarkerKey(), "1");
			writePendingUsageEvents(window.localStorage, [
				...readPendingUsageEvents(window.localStorage),
				createEvent(userId),
			]);
		}
		if (sessionUserId) void flushForUser(sessionUserId);
	}, [reportingEnabled, sessionUserId]);

	useEffect(() => {
		if (!reportingEnabled) return;
		const flush = () => {
			if (sessionUserId) void flushForUser(sessionUserId);
		};
		window.addEventListener("online", flush);
		return () => window.removeEventListener("online", flush);
	}, [reportingEnabled, sessionUserId]);

	return null;
}
