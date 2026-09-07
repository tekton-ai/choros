import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useMemo, useSyncExternalStore } from "react";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/host-workspaces-provider";
import { useProfiles } from "renderer/routes/_authenticated/providers/profile-provider";
import {
	getV2NotificationSourceKey,
	getV2NotificationSourcesForPane,
	useV2NotificationStore,
	type V2NotificationPaneLike,
	type V2NotificationSourceInput,
} from "renderer/stores/v2-notifications";
import {
	type ActivePaneStatus,
	getHighestPriorityStatus,
} from "shared/tabs-types";
import type { TerminalAgentBinding } from "../use-terminal-agent-bindings";
import { useTerminalAgentStatuses } from "../use-terminal-agent-statuses";
import {
	getAttentionWorkspaceIds,
	getProfileAttentionCounts,
} from "./attention-workspaces";

const TERMINAL_PREFIX = "terminal:";

function terminalIdsFromSources(
	sources: Iterable<V2NotificationSourceInput>,
): string[] {
	const ids: string[] = [];
	for (const key of new Set([...sources].map(getV2NotificationSourceKey))) {
		if (key.startsWith(TERMINAL_PREFIX)) {
			ids.push(key.slice(TERMINAL_PREFIX.length));
		}
	}
	return ids;
}

/**
 * Highest-priority status across a set of notification sources. Terminal
 * statuses are derived from host agent bindings (the single source of
 * truth); chat sources have no status yet and contribute nothing.
 */
export function useV2SourcesNotificationStatus(
	workspaceId: string,
	sources: Iterable<V2NotificationSourceInput>,
): ActivePaneStatus | null {
	const statuses = useTerminalAgentStatuses(workspaceId);
	return getHighestPriorityStatus(
		terminalIdsFromSources(sources).map((terminalId) =>
			statuses.get(terminalId),
		),
	);
}

export function useV2PaneNotificationStatus(
	workspaceId: string,
	pane: V2NotificationPaneLike | null | undefined,
): ActivePaneStatus | null {
	return useV2SourcesNotificationStatus(
		workspaceId,
		getV2NotificationSourcesForPane(pane),
	);
}

/**
 * Shared per query client, not per badge or Profile. It observes only existing
 * bindings data and user seen/unread state; it never mounts a query or changes
 * the sidebar's background eligibility.
 */
class AttentionWorkspaceStore {
	private workspaceIds: ReadonlySet<string> = new Set();
	private listeners = new Set<() => void>();
	private unsubscribeCache: (() => void) | undefined;
	private unsubscribeNotifications: (() => void) | undefined;

	constructor(private queryClient: QueryClient) {}

	private refresh = (): void => {
		const { manualUnread, terminalSeenAt } = useV2NotificationStore.getState();
		const next = getAttentionWorkspaceIds({
			bindingQueries: this.queryClient.getQueriesData<TerminalAgentBinding[]>({
				queryKey: ["terminal-agent-bindings"],
			}),
			manualUnread,
			terminalSeenAt,
		});
		if (next.size === this.workspaceIds.size) {
			let unchanged = true;
			for (const workspaceId of next) {
				if (!this.workspaceIds.has(workspaceId)) {
					unchanged = false;
					break;
				}
			}
			if (unchanged) return;
		}
		this.workspaceIds = next;
		for (const listener of this.listeners) listener();
	};

	getSnapshot = (): ReadonlySet<string> => {
		// No upstream listeners while unused. Refresh before a later consumer's
		// first render, retaining the snapshot identity when attention is equal.
		if (this.listeners.size === 0) this.refresh();
		return this.workspaceIds;
	};

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		if (this.listeners.size === 1) {
			this.unsubscribeCache = this.queryClient
				.getQueryCache()
				.subscribe((event) => {
					// `added` can fire while a query is built during render. Only
					// data-bearing events affect the existing attention semantics.
					if (event.type !== "updated" && event.type !== "removed") return;
					if (event.query.queryKey[0] === "terminal-agent-bindings") {
						this.refresh();
					}
				});
			this.unsubscribeNotifications = useV2NotificationStore.subscribe(
				(state, previous) => {
					if (
						state.manualUnread !== previous.manualUnread ||
						state.terminalSeenAt !== previous.terminalSeenAt
					) {
						this.refresh();
					}
				},
			);
			// Close the render-to-subscribe gap, including remounts after disposal.
			this.refresh();
		}
		return () => {
			this.listeners.delete(listener);
			if (this.listeners.size !== 0) return;
			this.unsubscribeCache?.();
			this.unsubscribeNotifications?.();
			this.unsubscribeCache = undefined;
			this.unsubscribeNotifications = undefined;
		};
	};
}

const attentionStores = new WeakMap<QueryClient, AttentionWorkspaceStore>();

function useAttentionWorkspaceIds(): ReadonlySet<string> {
	const queryClient = useQueryClient();
	const store = useMemo(() => {
		let existing = attentionStores.get(queryClient);
		if (!existing) {
			existing = new AttentionWorkspaceStore(queryClient);
			attentionStores.set(queryClient, existing);
		}
		return existing;
	}, [queryClient]);
	return useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		store.getSnapshot,
	);
}

/**
 * Global distinct workspace total for the OS Dock. Cached bindings and manual
 * unread marks retain their pre-Profile eligibility, even outside the current
 * Profile or when a workspace no longer has an observed bindings query.
 */
export function useV2AttentionWorkspaceCount(): number {
	return useAttentionWorkspaceIds().size;
}

export function useProfileAttentionCounts(): ReadonlyMap<string, number> {
	const workspaceIds = useAttentionWorkspaceIds();
	const { workspaces } = useHostWorkspaces();
	const { defaultProfileId, getWorkspaceProfileId } = useProfiles();
	return useMemo(
		() =>
			getProfileAttentionCounts({
				workspaceIds,
				workspaces,
				defaultProfileId,
				getWorkspaceProfileId,
			}),
		[workspaceIds, workspaces, defaultProfileId, getWorkspaceProfileId],
	);
}
