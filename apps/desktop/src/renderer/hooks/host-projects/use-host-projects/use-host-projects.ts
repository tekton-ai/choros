import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { getHostEventBus } from "renderer/lib/host-event-bus";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/local-host-service-provider";
import {
	applyProjectChangedEvent,
	HOST_PROJECTS_QUERY_KEY,
	type HostProjectItem,
	type HostProjectRow,
	normalizeHostProjectRow,
	toHostProjectItem,
} from "./use-host-projects.utils";

export type {
	HostProjectItem,
	HostProjectRow,
} from "./use-host-projects.utils";

const PROJECTS_FALLBACK_REFETCH_INTERVAL_MS = 30_000;

export interface UseHostProjectsResult {
	projects: HostProjectItem[];
	isReady: boolean;
}

export function useHostProjects(): UseHostProjectsResult {
	const queryClient = useQueryClient();
	const { activeHostUrl, machineId } = useLocalHostService();
	const query = useQuery({
		queryKey: HOST_PROJECTS_QUERY_KEY,
		enabled: activeHostUrl !== null,
		refetchInterval: PROJECTS_FALLBACK_REFETCH_INTERVAL_MS,
		refetchIntervalInBackground: true,
		networkMode: "always",
		retry: 1,
		queryFn: async (): Promise<HostProjectRow[]> => {
			if (!activeHostUrl) return [];
			const rows = (await getHostServiceClientByUrl(
				activeHostUrl,
			).project.list.query()) as Array<
				Partial<HostProjectRow> & { id: string; repoPath: string }
			>;
			return rows.map(normalizeHostProjectRow);
		},
	});

	useEffect(() => {
		if (!activeHostUrl) return;
		const bus = getHostEventBus(activeHostUrl);
		const removeListener = bus.on(
			"project:changed",
			"*",
			(projectId, event) => {
				queryClient.setQueryData<HostProjectRow[] | undefined>(
					HOST_PROJECTS_QUERY_KEY,
					(rows) => applyProjectChangedEvent(rows, event, projectId),
				);
			},
		);
		const releaseBus = bus.retain();
		return () => {
			removeListener();
			releaseBus();
		};
	}, [activeHostUrl, queryClient]);

	const projects = useMemo(
		() =>
			(query.data ?? []).map((row) =>
				toHostProjectItem(row, machineId, !query.isError),
			),
		[machineId, query.data, query.isError],
	);

	return {
		projects,
		isReady: activeHostUrl !== null && (query.isFetched || query.isError),
	};
}
