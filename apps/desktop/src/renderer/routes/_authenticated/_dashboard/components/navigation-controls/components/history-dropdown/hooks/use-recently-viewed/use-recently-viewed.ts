import { useLocation } from "@tanstack/react-router";
import { useRef } from "react";
import { persistentHistory } from "renderer/lib/persistent-hash-history";

export interface RecentlyViewedEntry {
	path: string;
	type: "v2-workspace";
	entityId: string;
	timestamp: number;
}

function pathnameOf(href: string): string {
	const queryIndex = href.indexOf("?");
	const hashIndex = href.indexOf("#");
	const cutoffs = [queryIndex, hashIndex].filter((i) => i >= 0);
	return cutoffs.length === 0 ? href : href.substring(0, Math.min(...cutoffs));
}

function parseResourceEntry(entry: {
	path: string;
	timestamp: number;
}): RecentlyViewedEntry | null {
	const pathname = pathnameOf(entry.path);

	const v2WsMatch = pathname.match(/^\/v2-workspace\/([^/]+)/);
	if (v2WsMatch?.[1])
		return {
			path: `/v2-workspace/${v2WsMatch[1]}`,
			type: "v2-workspace",
			entityId: v2WsMatch[1],
			timestamp: entry.timestamp,
		};
	return null;
}

export function useRecentlyViewed(limit = 20): RecentlyViewedEntry[] {
	useLocation(); // re-render on route change
	const prevRef = useRef<RecentlyViewedEntry[]>([]);

	const allEntries = persistentHistory.getEntries();
	const seen = new Map<string, RecentlyViewedEntry>();

	for (let i = allEntries.length - 1; i >= 0; i--) {
		const entry = allEntries[i];
		if (!entry) continue;
		const resource = parseResourceEntry(entry);
		if (resource && !seen.has(resource.path)) {
			seen.set(resource.path, resource);
		}
	}

	const next = Array.from(seen.values()).slice(0, limit);
	const prev = prevRef.current;

	if (
		prev.length === next.length &&
		prev.every((e, i) => e.path === next[i]?.path)
	) {
		return prev;
	}

	prevRef.current = next;
	return next;
}
