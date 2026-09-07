import type { TerminalAgentBinding } from "../use-terminal-agent-bindings";
import { deriveTerminalAgentStatus } from "../use-terminal-agent-statuses/derive-terminal-agent-status";

type AttentionBinding = Pick<
	TerminalAgentBinding,
	"workspaceId" | "terminalId" | "lastEventType" | "lastEventAt"
>;

type AttentionWorkspace = {
	id: string;
	hostId: string;
	projectId: string | null;
};

/** The same raw attention set drives both the Dock and Profile badges. */
export function getAttentionWorkspaceIds({
	bindingQueries,
	manualUnread,
	terminalSeenAt,
}: {
	bindingQueries: Iterable<
		readonly [unknown, readonly AttentionBinding[] | undefined]
	>;
	manualUnread: Readonly<Record<string, true>>;
	terminalSeenAt: Readonly<Record<string, number>>;
}): ReadonlySet<string> {
	const workspaceIds = new Set(Object.keys(manualUnread));
	for (const [, bindings] of bindingQueries) {
		for (const binding of bindings ?? []) {
			const status = deriveTerminalAgentStatus({
				lastEventType: binding.lastEventType,
				lastEventAt: binding.lastEventAt,
				lastSeenAt: terminalSeenAt[binding.terminalId],
			});
			if (
				status === "permission" ||
				status === "review" ||
				status === "failed"
			) {
				workspaceIds.add(binding.workspaceId);
			}
		}
	}
	return workspaceIds;
}

/** Resolve raw Host identities, never the currently visible sidebar rows. */
export function getProfileAttentionCounts({
	workspaceIds,
	workspaces,
	getWorkspaceProfileId,
	defaultProfileId,
}: {
	workspaceIds: ReadonlySet<string>;
	workspaces: Iterable<AttentionWorkspace>;
	getWorkspaceProfileId: (workspace: AttentionWorkspace) => string;
	defaultProfileId: string;
}): ReadonlyMap<string, number> {
	const remainingIds = new Set(workspaceIds);
	const counts = new Map<string, number>();
	for (const workspace of workspaces) {
		if (!remainingIds.delete(workspace.id)) continue;
		const profileId = getWorkspaceProfileId(workspace);
		counts.set(profileId, (counts.get(profileId) ?? 0) + 1);
	}
	// Manual marks and cached bindings can outlive their raw Host row. Keep
	// their existing Dock contribution rather than silently dropping attention.
	if (remainingIds.size > 0) {
		counts.set(
			defaultProfileId,
			(counts.get(defaultProfileId) ?? 0) + remainingIds.size,
		);
	}
	return counts;
}
