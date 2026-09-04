import { createFileRoute } from "@tanstack/react-router";
import { useHostProjects } from "renderer/hooks/host-projects/use-host-projects";
import { NotFound } from "renderer/routes/not-found";
import { V2ProjectSettings } from "../../v2-project/$projectId/components/v2-project-settings";

export const Route = createFileRoute(
	"/_authenticated/settings/projects/$projectId/",
)({
	component: ProjectDetailPage,
	notFoundComponent: NotFound,
	validateSearch: (
		search: Record<string, unknown>,
	): { hostId?: string; focus?: string } => ({
		hostId: typeof search.hostId === "string" ? search.hostId : undefined,
		focus: typeof search.focus === "string" ? search.focus : undefined,
	}),
});

function ProjectDetailPage() {
	const { projectId } = Route.useParams();
	const { hostId, focus } = Route.useSearch();
	const { projects, isReady } = useHostProjects();
	if (!isReady) return null;
	if (!projects.some((project) => project.projectKey === projectId)) {
		return <NotFound />;
	}
	return (
		<V2ProjectSettings
			projectId={projectId}
			hostId={hostId ?? null}
			focusField={focus ?? null}
		/>
	);
}
