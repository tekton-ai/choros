export interface ProjectQueryTarget {
	projectId: string;
	projectName: string;
	hostId: string | null;
	hostUrl: string | null;
}

export interface HostQueryTarget {
	/** Host id plus its project set, so key changes reset pagination. */
	key: string;
	hostId: string | null;
	hostUrl: string | null;
	projects: { projectId: string; projectName: string }[];
}

// One GitHub search request can cover every repository a host serves, so
// queries are issued per host rather than per project (rate-limit budget).
export function groupProjectTargetsByHost(
	targets: ProjectQueryTarget[],
): HostQueryTarget[] {
	const byHost = new Map<
		string,
		Omit<HostQueryTarget, "key"> & { hostKey: string }
	>();
	for (const target of targets) {
		const hostKey = target.hostId ?? "";
		const group = byHost.get(hostKey) ?? {
			hostKey,
			hostId: target.hostId,
			hostUrl: target.hostUrl,
			projects: [],
		};
		group.projects.push({
			projectId: target.projectId,
			projectName: target.projectName,
		});
		byHost.set(hostKey, group);
	}
	return [...byHost.values()].map(({ hostKey, ...group }) => ({
		...group,
		key: `${hostKey}\0${group.projects
			.map((project) => project.projectId)
			.join(",")}`,
	}));
}

export function selectProjectQueryScope<T extends { projectKey: string }>(
	hostProjects: T[],
	projectFilters: string[],
	isProjectVisible: (projectId: string) => boolean,
) {
	const projects = hostProjects.filter((project) =>
		isProjectVisible(project.projectKey),
	);
	const selected = new Set(projectFilters);
	const selectedProjects =
		selected.size === 0
			? projects
			: projects.filter((project) => selected.has(project.projectKey));
	return { projects, selectedProjects };
}
