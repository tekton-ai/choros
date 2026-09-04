import { CLIError, string } from "@choros/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { findWorkspaceOnHost } from "../../../lib/host-workspaces";

export default command({
	description: "Create a terminal session in an existing workspace",
	options: {
		workspace: string().required().desc("Workspace ID"),
		command: string().desc(
			"Shell command to run in the terminal. Omit to open an interactive shell",
		),
		cwd: string().desc(
			"Working directory for the terminal (defaults to the worktree)",
		),
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

		const result = await target.client.terminal.createSession.mutate({
			workspaceId: options.workspace,
			initialCommand: options.command ?? undefined,
			cwd: options.cwd ?? undefined,
		});

		return {
			data: result,
			message: `Created terminal ${result.terminalId} in workspace ${options.workspace}`,
		};
	},
});
