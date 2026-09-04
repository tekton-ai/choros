import { Button } from "@choros/ui/button";
import { Spinner } from "@choros/ui/spinner";
import { Trans } from "@lingui/react/macro";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/use-host-projects";
import { PullRequestsView } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/pull-requests-view";
import { ProjectIssues } from "./components/project-issues";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/project/$projectId/",
)({
	component: ProjectPage,
});

function ProjectPage() {
	const { projectId } = Route.useParams();
	const { projects, isReady } = useHostProjects();
	const project = projects.find(
		(candidate) => candidate.projectKey === projectId,
	);
	const [tab, setTab] = useState<"issues" | "pullRequests">("issues");

	if (!isReady) {
		return (
			<div className="flex h-full items-center justify-center">
				<Spinner />
			</div>
		);
	}

	if (!project) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				<Trans id="dashboard.project.notFound">Project not found</Trans>
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-1 flex-col bg-background">
			<header className="flex shrink-0 items-center gap-4 border-b px-4 py-3">
				<h1 className="min-w-0 truncate text-sm font-semibold">
					{project.name}
				</h1>
				<div className="ml-auto flex items-center gap-1">
					<Button
						variant={tab === "issues" ? "secondary" : "ghost"}
						size="sm"
						onClick={() => setTab("issues")}
					>
						<Trans id="dashboard.project.tabs.issues">Issues</Trans>
					</Button>
					<Button
						variant={tab === "pullRequests" ? "secondary" : "ghost"}
						size="sm"
						onClick={() => setTab("pullRequests")}
					>
						<Trans id="dashboard.project.tabs.pullRequests">
							Pull requests
						</Trans>
					</Button>
				</div>
			</header>
			<div className="min-h-0 flex-1">
				{tab === "issues" ? (
					<ProjectIssues projectId={projectId} />
				) : (
					<PullRequestsView initialProjects={[projectId]} />
				)}
			</div>
		</div>
	);
}
