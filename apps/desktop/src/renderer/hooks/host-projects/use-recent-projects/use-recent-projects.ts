import { useMemo } from "react";
import { resolveProjectIconUrl } from "renderer/hooks/host-projects/resolve-project-icon-url";
import { useHostProjects } from "renderer/hooks/host-projects/use-host-projects";
import type { ProjectOption } from "renderer/routes/_authenticated/components/dashboard-new-workspace-modal/components/dashboard-new-workspace-form/prompt-group/types";

export function useRecentProjects(): ProjectOption[] {
	// Projects are fully local — the host fan-out is the only source that
	// includes local-first projects (the frozen cloud collection never will).
	const { projects: hostProjects } = useHostProjects();

	return useMemo(
		() =>
			hostProjects.map((project) => ({
				id: project.projectKey,
				name: project.name,
				githubOwner: project.repoOwner,
				githubRepoName: project.repoName,
				iconUrl: resolveProjectIconUrl(project),
				needsSetup: null,
			})),
		[hostProjects],
	);
}
