import type { HistoryEntry } from "renderer/lib/persistent-hash-history/persistent-hash-history";
import {
	type AccessibleProfileWorkspace,
	parseProfileRoute,
} from "renderer/routes/_authenticated/providers/profile-provider/utils/profile-projection/profile-projection";

const MAX_RECENT_HISTORY_ENTRIES = 100;

export function getRecentHistoryWorkspaces<
	T extends AccessibleProfileWorkspace,
>({
	entries,
	workspaces,
	limit,
}: {
	entries: readonly HistoryEntry[];
	workspaces: readonly T[];
	limit: number;
}): T[] {
	const accessibleById = new Map<string, T>();
	for (const workspace of workspaces) {
		if (
			workspace.archivedAt == null &&
			workspace.hostReachable &&
			workspace.worktreeExists &&
			!accessibleById.has(workspace.id)
		) {
			accessibleById.set(workspace.id, workspace);
		}
	}

	const result: T[] = [];
	const firstIndex = Math.max(0, entries.length - MAX_RECENT_HISTORY_ENTRIES);
	for (let index = entries.length - 1; index >= firstIndex; index -= 1) {
		if (result.length >= limit) break;
		const entry = entries[index];
		if (!entry) continue;
		let route: ReturnType<typeof parseProfileRoute>;
		try {
			route = parseProfileRoute(entry.path);
		} catch {
			// Invalid legacy URLs must not prevent the remaining history from loading.
			continue;
		}
		if (route.kind !== "workspace") continue;
		const workspace = accessibleById.get(route.workspaceId);
		if (!workspace) continue;
		accessibleById.delete(route.workspaceId);
		result.push(workspace);
	}
	return result;
}
