import { boolean, CLIError, string } from "@choros/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { findWorkspaceOnHost } from "../../../lib/host-workspaces";

export default command({
	description:
		"Send a follow-up message to a terminal already running in a workspace",
	options: {
		workspace: string().required().desc("Workspace ID"),
		terminal: string()
			.required()
			.desc("Terminal ID (the sessionId `agents create` returned)"),
		text: string().required().desc("Text to write into the terminal"),
		noSubmit: boolean().desc("Stage the text without pressing Enter"),
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

		const result = await target.client.terminal.send.mutate({
			terminalId: options.terminal,
			workspaceId: options.workspace,
			text: options.text,
			submit: !options.noSubmit,
		});

		return {
			data: result,
			message: `Sent to terminal ${options.terminal}`,
		};
	},
});
