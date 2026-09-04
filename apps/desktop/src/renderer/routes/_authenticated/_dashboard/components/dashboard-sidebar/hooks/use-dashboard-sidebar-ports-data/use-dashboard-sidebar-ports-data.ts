import { i18n } from "@choros/i18n";
import type { PortChangedPayload } from "@choros/workspace-client";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { getHostEventBus } from "renderer/lib/host-event-bus";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useVisibleSidebarWorkspaceIds } from "renderer/routes/_authenticated/hooks/use-visible-sidebar-workspace-ids";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/host-workspaces-provider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/local-host-service-provider";
import {
	applyPortEventsToHostPortsResult,
	type DashboardSidebarPortGroup,
	type DashboardSidebarPortsLoadError,
	getHostPortsQueryKey,
	groupDashboardSidebarPorts,
	type HostPortsResult,
} from "./use-dashboard-sidebar-ports-data.utils";

export type {
	DashboardSidebarPort,
	DashboardSidebarPortGroup,
} from "./use-dashboard-sidebar-ports-data.utils";

const PORTS_FALLBACK_REFETCH_INTERVAL_MS = 30_000;
const PORT_EVENT_CACHE_BATCH_DELAY_MS = 100;

export function useDashboardSidebarPortsData(enabled = true): {
	workspacePortGroups: DashboardSidebarPortGroup[];
	totalPortCount: number;
	portLoadErrors: DashboardSidebarPortsLoadError[];
} {
	const queryClient = useQueryClient();
	const { activeHostUrl, machineId } = useLocalHostService();
	const visibleWorkspaceIds = useVisibleSidebarWorkspaceIds();

	const { workspaces: allWorkspaces } = useHostWorkspaces();
	const workspaces = useMemo(
		() =>
			allWorkspaces
				.filter((workspace) => visibleWorkspaceIds.has(workspace.id))
				.map((workspace) => ({
					id: workspace.id,
					name: workspace.name,
					hostId: workspace.hostId,
				})),
		[allWorkspaces, visibleWorkspaceIds],
	);

	// Skip per-host queries, polling, and `port:changed` subscriptions when
	// nothing will render ports (e.g. inline mode with the sidebar collapsed).
	// `enabled` gates this list directly instead of the caller conditionally
	// mounting this hook's provider, so toggling it only resubscribes the
	// effect below rather than remounting the provider's subtree.
	const hostsToQuery = useMemo(
		() =>
			enabled && activeHostUrl && machineId && workspaces.length > 0
				? [
						{
							machineId,
							hostType: "local-device" as const,
							hostUrl: activeHostUrl,
							workspaceIds: workspaces.map((workspace) => workspace.id),
						},
					]
				: [],
		[activeHostUrl, enabled, machineId, workspaces],
	);

	const queries = useQueries({
		queries: hostsToQuery.map((host) => ({
			queryKey: getHostPortsQueryKey(host),
			refetchInterval: PORTS_FALLBACK_REFETCH_INTERVAL_MS,
			queryFn: async (): Promise<HostPortsResult> => {
				const client = getHostServiceClientByUrl(host.hostUrl);
				const ports = await client.ports.getAll.query({
					workspaceIds: host.workspaceIds,
				});
				return {
					hostId: host.machineId,
					hostType: host.hostType,
					hostUrl: host.hostUrl,
					ports,
				};
			},
		})),
	});

	useEffect(() => {
		const cleanups: Array<() => void> = [];

		for (const host of hostsToQuery) {
			const workspaceIds = new Set(host.workspaceIds);
			const pendingEvents: PortChangedPayload[] = [];
			let cacheUpdateTimer: ReturnType<typeof setTimeout> | null = null;
			const flushPortEvents = () => {
				cacheUpdateTimer = null;
				const events = pendingEvents.splice(0);
				if (events.length === 0) return;
				queryClient.setQueryData<HostPortsResult | undefined>(
					getHostPortsQueryKey(host),
					(result) =>
						applyPortEventsToHostPortsResult(result, events, {
							hostId: host.machineId,
							hostType: host.hostType,
							hostUrl: host.hostUrl,
						}),
				);
			};
			const enqueuePortEvent = (event: PortChangedPayload) => {
				pendingEvents.push(event);
				if (cacheUpdateTimer) return;
				cacheUpdateTimer = setTimeout(
					flushPortEvents,
					PORT_EVENT_CACHE_BATCH_DELAY_MS,
				);
			};
			const bus = getHostEventBus(host.hostUrl);
			const removeListener = bus.on(
				"port:changed",
				"*",
				(workspaceId, event) => {
					if (!workspaceIds.has(workspaceId)) return;
					enqueuePortEvent(event);
				},
			);
			const releaseBus = bus.retain();
			cleanups.push(() => {
				if (cacheUpdateTimer) {
					clearTimeout(cacheUpdateTimer);
					cacheUpdateTimer = null;
				}
				flushPortEvents();
				removeListener();
				releaseBus();
			});
		}

		return () => {
			for (const cleanup of cleanups) {
				cleanup();
			}
		};
	}, [hostsToQuery, queryClient]);

	const workspacePortGroups = useMemo(
		() =>
			groupDashboardSidebarPorts({
				hostPortResults: queries.map((query) => query.data),
				workspaces,
			}),
		[queries, workspaces],
	);

	const totalPortCount = workspacePortGroups.reduce(
		(sum, group) => sum + group.ports.length,
		0,
	);

	const portLoadErrors = queries.flatMap((query, index) => {
		if (!query.isError && !query.isRefetchError) return [];
		const host = hostsToQuery[index];
		if (!host) return [];
		return [
			{
				hostId: host.machineId,
				hostType: host.hostType,
				message:
					query.error instanceof Error
						? query.error.message
						: i18n._({
								id: "dashboard.sidebar.portsData.unableToLoadPorts",
								message: "Unable to load ports",
							}),
			},
		];
	});

	return {
		workspacePortGroups,
		totalPortCount,
		portLoadErrors,
	};
}
