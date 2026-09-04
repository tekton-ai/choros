import { CLIError, string } from "@choros/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { findWorkspaceOnHost } from "../../../lib/host-workspaces";

export default command({
	description: "Close (dispose) a terminal running in a workspace",
	options: {
		workspace: string().required().desc("Workspace ID"),
		terminal: string().required().desc("Terminal ID to close"),
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

		const result = await target.client.terminal.killSession.mutate({
			terminalId: options.terminal,
			workspaceId: options.workspace,
		});

		return {
			data: result,
			message: `Closed terminal ${options.terminal}`,
		};
	},
});
