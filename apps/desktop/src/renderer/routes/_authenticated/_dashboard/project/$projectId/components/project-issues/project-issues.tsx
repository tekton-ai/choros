import { Checkbox } from "@choros/ui/checkbox";
import { Input } from "@choros/ui/input";
import { Label } from "@choros/ui/label";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { useProjectQueryTargets } from "renderer/routes/_authenticated/_dashboard/hooks/use-project-query-targets";
import { GitHubIssuesContent } from "./components/github-issues-content";

export function ProjectIssues({ projectId }: { projectId: string }) {
	const { t } = useLingui();
	const [searchQuery, setSearchQuery] = useState("");
	const [includeClosed, setIncludeClosed] = useState(false);
	const { projects, targets, isReady } = useProjectQueryTargets([projectId]);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
				<Input
					value={searchQuery}
					onChange={(event) => setSearchQuery(event.target.value)}
					placeholder={t({
						id: "dashboard.project.issues.searchPlaceholder",
						message: "Search GitHub issues",
					})}
					className="max-w-sm"
				/>
				<div className="ml-auto flex items-center gap-2">
					<Checkbox
						id="include-closed-issues"
						checked={includeClosed}
						onCheckedChange={(checked) => setIncludeClosed(checked === true)}
					/>
					<Label
						htmlFor="include-closed-issues"
						className="text-sm text-muted-foreground"
					>
						<Trans id="dashboard.project.issues.includeClosed">
							Include closed
						</Trans>
					</Label>
				</div>
			</div>
			<GitHubIssuesContent
				projectFilters={[projectId]}
				projectTargets={targets}
				areProjectsReady={isReady}
				hasProjects={projects.length > 0}
				searchQuery={searchQuery}
				includeClosed={includeClosed}
			/>
		</div>
	);
}
