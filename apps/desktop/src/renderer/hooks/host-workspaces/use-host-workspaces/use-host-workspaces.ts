import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { getHostEventBus } from "renderer/lib/host-event-bus";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/local-host-service-provider";
import {
	applyWorkspaceChangedEvent,
	HOST_ARCHIVED_WORKSPACES_QUERY_KEY,
	HOST_WORKSPACES_QUERY_KEY,
	type HostWorkspaceItem,
	type HostWorkspaceRow,
	isEventBusReopen,
} from "./use-host-workspaces.utils";

export type { HostWorkspaceItem } from "./use-host-workspaces.utils";

const WORKSPACES_FALLBACK_REFETCH_INTERVAL_MS = 30_000;

export interface HostWorkspacesCacheOps {
	resolveHostUrl: (hostId: string) => string | null;
	upsertWorkspace: (row: HostWorkspaceRow) => void;
	removeWorkspace: (hostId: string, workspaceId: string) => void;
	invalidateHost: (hostId: string) => void;
	hasLiveTargets: boolean;
	refetchAll: () => Promise<void>;
}

export interface UseHostWorkspacesResult {
	workspaces: HostWorkspaceItem[];
	isReady: boolean;
	hostsSettled: boolean;
	cache: HostWorkspacesCacheOps;
}

export function useHostWorkspacesSource(
	scopedHostId?: string | null,
	options?: { includeArchived?: boolean },
): UseHostWorkspacesResult {
	const includeArchived = options?.includeArchived ?? false;
	const queryClient = useQueryClient();
	const { activeHostUrl, machineId } = useLocalHostService();
	const targetsLocalHost =
		scopedHostId === undefined ||
		scopedHostId === null ||
		scopedHostId === machineId;

	const liveQuery = useQuery({
		queryKey: HOST_WORKSPACES_QUERY_KEY,
		enabled: activeHostUrl !== null && targetsLocalHost,
		refetchInterval: WORKSPACES_FALLBACK_REFETCH_INTERVAL_MS,
		refetchIntervalInBackground: true,
		networkMode: "always",
		retry: 1,
		queryFn: async () =>
			(await getHostServiceClientByUrl(
				activeHostUrl as string,
			).workspace.list.query()) as HostWorkspaceRow[],
	});
	const archivedQuery = useQuery({
		queryKey: HOST_ARCHIVED_WORKSPACES_QUERY_KEY,
		enabled: includeArchived && activeHostUrl !== null && targetsLocalHost,
		refetchInterval: WORKSPACES_FALLBACK_REFETCH_INTERVAL_MS,
		networkMode: "always",
		queryFn: async () => {
			const rows = (await getHostServiceClientByUrl(
				activeHostUrl as string,
			).workspace.list.query({ includeArchived: true })) as HostWorkspaceRow[];
			return rows.filter((row) => row.archivedAt != null);
		},
	});

	const busEverOpened = useRef(false);
	useEffect(() => {
		if (!activeHostUrl || !targetsLocalHost) return;
		const bus = getHostEventBus(activeHostUrl);
		const removeListener = bus.on(
			"workspace:changed",
			"*",
			(workspaceId, event) => {
				queryClient.setQueryData<HostWorkspaceRow[] | undefined>(
					HOST_WORKSPACES_QUERY_KEY,
					(rows) =>
						applyWorkspaceChangedEvent(rows, event, machineId, workspaceId),
				);
				if (includeArchived) {
					void queryClient.invalidateQueries({
						queryKey: HOST_ARCHIVED_WORKSPACES_QUERY_KEY,
					});
				}
			},
		);
		if (bus.getConnectionStatus().state === "open")
			busEverOpened.current = true;
		const removeStatusListener = bus.subscribeConnectionStatus((status) => {
			const reopened = isEventBusReopen(busEverOpened.current, status.state);
			if (status.state === "open") busEverOpened.current = true;
			if (reopened) {
				void queryClient.invalidateQueries({
					queryKey: ["host-service"],
				});
			}
		});
		const releaseBus = bus.retain();
		return () => {
			removeListener();
			removeStatusListener();
			releaseBus();
		};
	}, [
		activeHostUrl,
		includeArchived,
		machineId,
		queryClient,
		targetsLocalHost,
	]);

	const resolveHostUrl = useCallback(
		(hostId: string) => (hostId === machineId ? activeHostUrl : null),
		[activeHostUrl, machineId],
	);
	const upsertWorkspace = useCallback(
		(row: HostWorkspaceRow) => {
			if (row.hostId !== machineId) return;
			queryClient.setQueryData<HostWorkspaceRow[]>(
				HOST_WORKSPACES_QUERY_KEY,
				(rows = []) => {
					const index = rows.findIndex((item) => item.id === row.id);
					if (index < 0) return [...rows, row];
					const next = [...rows];
					next[index] = row;
					return next;
				},
			);
		},
		[machineId, queryClient],
	);
	const removeWorkspace = useCallback(
		(hostId: string, workspaceId: string) => {
			if (hostId !== machineId) return;
			queryClient.setQueryData<HostWorkspaceRow[]>(
				HOST_WORKSPACES_QUERY_KEY,
				(rows = []) => rows.filter((row) => row.id !== workspaceId),
			);
		},
		[machineId, queryClient],
	);
	const invalidateHost = useCallback(
		(hostId: string) => {
			if (hostId === machineId) {
				void queryClient.invalidateQueries({ queryKey: ["host-service"] });
			}
		},
		[machineId, queryClient],
	);
	const refetchAll = useCallback(async () => {
		await Promise.all([
			liveQuery.refetch(),
			...(includeArchived ? [archivedQuery.refetch()] : []),
		]);
	}, [archivedQuery.refetch, includeArchived, liveQuery.refetch]);

	const workspaces = useMemo<HostWorkspaceItem[]>(() => {
		if (!targetsLocalHost) return [];
		const live = (liveQuery.data ?? []).map((row) => ({
			...row,
			hostReachable: !liveQuery.isError,
		}));
		if (!includeArchived) return live;
		const liveIds = new Set(live.map((row) => row.id));
		return [
			...live,
			...(archivedQuery.data ?? [])
				.filter((row) => !liveIds.has(row.id))
				.map((row) => ({ ...row, hostReachable: !archivedQuery.isError })),
		];
	}, [
		archivedQuery.data,
		archivedQuery.isError,
		includeArchived,
		liveQuery.data,
		liveQuery.isError,
		targetsLocalHost,
	]);

	return {
		workspaces,
		isReady:
			!targetsLocalHost ||
			(activeHostUrl !== null && (liveQuery.isFetched || liveQuery.isError)),
		hostsSettled: true,
		cache: {
			resolveHostUrl,
			upsertWorkspace,
			removeWorkspace,
			invalidateHost,
			hasLiveTargets: activeHostUrl !== null,
			refetchAll,
		},
	};
}
