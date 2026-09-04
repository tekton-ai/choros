import { CLIError, string, table } from "@choros/cli-framework";
import { normalizeWorkspaceTag } from "@choros/shared/workspace-tags";
import { command } from "../../../lib/command";
import { listWorkspacesOnHost } from "../../../lib/host-workspaces";

export default command({
	description: "List workspaces on a host (default: this machine)",
	options: {
		project: string().desc("Filter by project name (case-insensitive) or id"),
		search: string()
			.alias("s")
			.desc("Search by workspace name or branch substring"),
		tag: string().desc("Filter to workspaces carrying this tag"),
	},
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["name", "branch", "projectName", "tags", "id"],
			["NAME", "BRANCH", "PROJECT", "TAGS", "ID"],
			[30, 30, 24, 20, 36],
		),
	run: async ({ options }) => {
		const { workspaces } = await listWorkspacesOnHost();

		const projectInput = options.project?.toLowerCase();
		const search = options.search?.toLowerCase();
		// Normalize both sides — `--tag Perf` must match a workspace tagged
		// "perf". Rows served by an older host carry no tags field.
		const tagFilter = normalizeWorkspaceTag(options.tag);
		if (options.tag !== undefined && tagFilter == null) {
			throw new CLIError(
				"Invalid --tag value",
				"Tags are 1-64 characters after trimming",
			);
		}
		return workspaces
			.filter(
				(workspace) =>
					!projectInput ||
					workspace.projectId?.toLowerCase() === projectInput ||
					workspace.projectName?.toLowerCase() === projectInput,
			)
			.filter(
				(workspace) =>
					!search ||
					workspace.name.toLowerCase().includes(search) ||
					workspace.branch.toLowerCase().includes(search),
			)
			.filter(
				(workspace) =>
					tagFilter == null || (workspace.tags ?? []).includes(tagFilter),
			)
			.map((workspace) => ({
				...workspace,
				// Orphaned projectIds fall back to the raw id; project-less
				// session workspaces render as "session".
				projectName: workspace.projectName ?? workspace.projectId ?? "session",
				tags: (workspace.tags ?? []).join(", "),
			}));
	},
});
