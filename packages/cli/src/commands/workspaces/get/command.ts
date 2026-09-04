import { CLIError, positional, string } from "@choros/cli-framework";
import { command } from "../../../lib/command";
import { findWorkspaceOnHost } from "../../../lib/host-workspaces";

export default command({
	description: "Show details for a single workspace by id",
	args: [
		positional("id").desc("Workspace ID (defaults to $CHOROS_WORKSPACE_ID)"),
	],
	options: {
		field: string()
			.alias("f")
			.desc(
				"Print a single field's raw value (e.g. name, branch, worktreePath)",
			),
	},
	run: async ({ args, options }) => {
		const id =
			(args.id as string | undefined) ?? process.env.CHOROS_WORKSPACE_ID;
		if (!id) {
			throw new CLIError(
				"No workspace id",
				"Pass an id or run inside a workspace where $CHOROS_WORKSPACE_ID is set",
			);
		}

		const { hostId, workspace } = await findWorkspaceOnHost(id);
		if (!workspace) {
			throw new CLIError(
				`Workspace not found on host ${hostId}: ${id}`,
				"List local workspaces with: choros workspaces list",
			);
		}

		const projectName = workspace.projectName ?? workspace.projectId;
		const hostName = workspace.hostId;

		const detail = {
			id: workspace.id,
			name: workspace.name,
			branch: workspace.branch,
			type: workspace.type,
			projectId: workspace.projectId,
			projectName,
			hostId: workspace.hostId,
			hostName,
			worktreePath: workspace.worktreePath,
			worktreeExists: workspace.worktreeExists,
			createdAt: workspace.createdAt,
		};

		if (options.field) {
			if (!Object.hasOwn(detail, options.field)) {
				throw new CLIError(
					`Unknown field: ${options.field}`,
					`Available fields: ${Object.keys(detail).join(", ")}`,
				);
			}
			const value = detail[options.field as keyof typeof detail];
			return {
				data: detail,
				message: value === null || value === undefined ? "" : String(value),
			};
		}

		const width = Math.max(...Object.keys(detail).map((key) => key.length));
		const message = Object.entries(detail)
			.map(([key, value]) => {
				const shown = value === null || value === undefined ? "—" : value;
				return `${key.padEnd(width)}  ${shown}`;
			})
			.join("\n");

		return { data: detail, message };
	},
});
