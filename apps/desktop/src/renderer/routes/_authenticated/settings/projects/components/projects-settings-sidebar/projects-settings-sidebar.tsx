import { useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { resolveProjectIconUrl } from "renderer/hooks/host-projects/resolve-project-icon-url";
import { useHostProjects } from "renderer/hooks/host-projects/use-host-projects";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/project-thumbnail";
import {
	type SettingsListGroup,
	SettingsListSidebar,
	settingsListItemClass,
} from "../../../components/settings-list-sidebar";

interface ProjectRow {
	id: string;
	name: string;
	iconUrl: string | null;
	color: string | null;
}

export function ProjectsSettingsSidebar({
	selectedProjectId,
}: {
	selectedProjectId: string | null;
}) {
	const { t } = useLingui();
	const { projects } = useHostProjects();
	const groups = useMemo<Array<SettingsListGroup<ProjectRow>>>(
		() => [
			{
				id: "projects",
				title: "projects",
				rows: projects.map((project) => ({
					id: project.projectKey,
					name: project.name,
					iconUrl: resolveProjectIconUrl(project),
					color: project.color,
				})),
			},
		],
		[projects],
	);
	return (
		<SettingsListSidebar
			searchPlaceholder={t({
				id: "settings.projects.filterPlaceholder",
				message: "Filter projects...",
			})}
			searchAriaLabel={t({
				id: "settings.projects.filterAria",
				message: "Filter projects",
			})}
			hideFilterWhenEmpty
			groups={groups}
			filterRow={(row, query) =>
				row.name.toLowerCase().includes(query.toLowerCase())
			}
			getRowKey={(row) => row.id}
			emptyLabel={t({
				id: "settings.projects.emptyLabel",
				message: "No projects yet.",
			})}
			noMatchLabel={(query) =>
				t({
					id: "settings.projects.noMatchLabel",
					message: `No projects match "${query}".`,
				})
			}
			renderRow={(row) => (
				<Link
					to="/settings/projects/$projectId"
					params={{ projectId: row.id }}
					className={settingsListItemClass(
						row.id === selectedProjectId,
						"gap-2",
					)}
				>
					<ProjectThumbnail
						projectName={row.name}
						iconUrl={row.iconUrl}
						color={row.color}
						className="size-4"
					/>
					<span className="truncate">{row.name}</span>
				</Link>
			)}
		/>
	);
}
