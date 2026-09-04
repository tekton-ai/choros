import { CLIError, number, string } from "@choros/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { findWorkspaceOnHost } from "../../../lib/host-workspaces";

export default command({
	description: "Read a terminal's current screen back as text",
	options: {
		workspace: string().required().desc("Workspace ID"),
		terminal: string().required().desc("Terminal ID to read"),
		maxLines: number().int().desc("Cap returned rows from the bottom"),
	},
	run: async ({ options }) => {
		const { hostId, workspace } = await findWorkspaceOnHost(options.workspace);
		if (!workspace) {
			throw new CLIError(
				`Workspace not found on host ${hostId}: ${options.workspace}`,
				"List local workspaces with: choros workspaces list",
			);
		}

		const target = await resolveHostTarget();

		const result = await target.client.terminal.snapshot.query({
			terminalId: options.terminal,
			workspaceId: options.workspace,
			maxLines: options.maxLines ?? undefined,
		});

		return {
			data: result,
			message: result.text,
		};
	},
});
