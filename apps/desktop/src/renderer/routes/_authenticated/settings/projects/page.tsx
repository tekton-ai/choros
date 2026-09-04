import { Trans } from "@lingui/react/macro";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/use-host-projects";

export const Route = createFileRoute("/_authenticated/settings/projects/")({
	component: ProjectsIndexPage,
});

function ProjectsIndexPage() {
	const navigate = useNavigate();
	const { projects, isReady } = useHostProjects();
	const firstProjectId = useMemo(
		() =>
			[...projects].sort((a, b) => a.name.localeCompare(b.name))[0]
				?.projectKey ?? null,
		[projects],
	);
	useEffect(() => {
		if (!firstProjectId) return;
		void navigate({
			to: "/settings/projects/$projectId",
			params: { projectId: firstProjectId },
			replace: true,
		});
	}, [firstProjectId, navigate]);
	if (!isReady) return null;
	if (projects.length === 0) {
		return (
			<div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
				<Trans id="settings.projects.empty">No projects yet.</Trans>
			</div>
		);
	}
	return null;
}
