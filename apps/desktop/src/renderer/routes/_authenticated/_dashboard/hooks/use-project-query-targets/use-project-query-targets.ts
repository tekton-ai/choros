import { useMemo } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/use-host-projects";
import { useHostUrls } from "renderer/hooks/host-service/use-host-target-url";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/local-host-service-provider";
import { useProfiles } from "renderer/routes/_authenticated/providers/profile-provider";
import { selectServingHostId } from "../use-project-host/use-project-host";
import {
	type ProjectQueryTarget,
	selectProjectQueryScope,
} from "./project-query-scope";

export function useProjectQueryTargets(projectFilters: string[]) {
	const { projects: hostProjects, isReady } = useHostProjects();
	const { isProjectVisible, isReady: areProfilesReady } = useProfiles();
	const { projects, selectedProjects } = useMemo(
		() =>
			selectProjectQueryScope(
				areProfilesReady ? hostProjects : [],
				projectFilters,
				isProjectVisible,
			),
		[areProfilesReady, hostProjects, projectFilters, isProjectVisible],
	);
	const { machineId } = useLocalHostService();
	const selectedHostIds = useMemo(
		() =>
			Array.from(
				new Set(
					selectedProjects
						.map((project) => selectServingHostId(project.hostIds, machineId))
						.filter((hostId): hostId is string => hostId !== null),
				),
			),
		[selectedProjects, machineId],
	);
	const hostUrls = useHostUrls(selectedHostIds);
	const hostUrlById = useMemo(
		() => new Map(hostUrls.map((target) => [target.hostId, target.url])),
		[hostUrls],
	);
	const targets = useMemo<ProjectQueryTarget[]>(
		() =>
			selectedProjects.map((project) => {
				const hostId = selectServingHostId(project.hostIds, machineId);
				return {
					projectId: project.projectKey,
					projectName: project.name,
					hostId,
					hostUrl: hostId ? (hostUrlById.get(hostId) ?? null) : null,
				};
			}),
		[selectedProjects, machineId, hostUrlById],
	);

	return { projects, targets, isReady: isReady && areProfilesReady };
}
