import { boolean, CLIError, number, string } from "@choros/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { uploadAttachments } from "../../../lib/upload-attachments";

export default command({
	description: "Create a workspace on a host",
	options: {
		project: string().desc(
			"Project ID. Omit to create a project-less session (a managed scratch folder)",
		),
		name: string().desc("Workspace name"),
		branch: string().desc("Git branch (required unless --pr is set)"),
		pr: number().desc("PR number — checks out the verified PR head"),
		baseBranch: string().desc(
			"Branch to fork from when `branch` does not exist (defaults to project default)",
		),
		skipBranchPrefix: boolean().desc(
			"Use --branch exactly as given instead of namespacing it under the project branch prefix",
		),
		agent: string().desc(
			"Agent to spawn after creation. Preset id (`claude`, `codex`, …), HostAgentConfig instance UUID, or `choros`",
		),
		prompt: string().desc(
			"Initial prompt the agent starts with. Required when --agent is set",
		),
		effort: string().desc(
			"Reasoning effort for the spawned agent (agent-specific; omit to use the agent default)",
		),
		command: string().desc(
			"Shell command to run in the new workspace after creation",
		),
		attachment: string()
			.variadic()
			.desc(
				"Local file path to upload as an attachment to the host. Repeatable. Only used when --agent is set",
			),
		tag: string()
			.variadic()
			.desc(
				"Workspace tag. Repeatable. Each tag files the workspace into a sidebar folder of the same name",
			),
	},
	run: async ({ options }) => {
		const projectId = options.project;
		const isSession = projectId === undefined;
		if (isSession) {
			for (const [flag, value] of [
				["--branch", options.branch],
				["--pr", options.pr],
				["--base-branch", options.baseBranch],
				["--skip-branch-prefix", options.skipBranchPrefix || undefined],
				["--tag", options.tag?.length ? options.tag : undefined],
			] as const) {
				if (value !== undefined) {
					throw new CLIError(
						`${flag} requires --project`,
						"Sessions are project-less scratch folders with no git branch semantics",
					);
				}
			}
		} else {
			if (options.branch && options.pr) {
				throw new CLIError(
					"Specify only one of --branch or --pr",
					"Use --branch <name> or --pr <number>",
				);
			}
			if (!options.branch && !options.pr) {
				throw new CLIError(
					"Specify --branch or --pr",
					"Use --branch <name> or --pr <number>",
				);
			}
		}

		if (options.prompt && !options.agent) {
			throw new CLIError(
				"--prompt requires --agent",
				"Pass --agent <id> alongside --prompt",
			);
		}
		if (options.agent && !options.prompt) {
			throw new CLIError(
				"--agent requires --prompt",
				"Pass --prompt <text> alongside --agent",
			);
		}
		if (options.effort && !options.agent) {
			throw new CLIError(
				"--effort requires --agent",
				"Pass --agent <id> alongside --effort",
			);
		}
		if (options.attachment && options.attachment.length > 0 && !options.agent) {
			throw new CLIError(
				"--attachment requires --agent",
				"Attachments are only meaningful when launching an agent",
			);
		}

		const target = await resolveHostTarget();

		if (!isSession && !options.name) {
			throw new CLIError("--name is required when --project is set");
		}

		const attachmentIds = options.attachment
			? await uploadAttachments(target.client, options.attachment)
			: [];

		const agents =
			options.agent && options.prompt
				? [
						{
							agent: options.agent,
							prompt: options.prompt,
							effort: options.effort,
							...(attachmentIds.length > 0 ? { attachmentIds } : {}),
						},
					]
				: undefined;

		if (isSession) {
			const result = await target.client.workspaces.createSession.mutate({
				name: options.name,
				agents,
				command: options.command ?? undefined,
			});
			return {
				data: result,
				message: `Created session "${result.workspace.name}" on host ${target.hostId}`,
			};
		}

		if (!options.name) {
			throw new CLIError("--name is required when --project is set");
		}
		const result = await target.client.workspaces.create.mutate({
			projectId,
			name: options.name,
			branch: options.branch,
			pr: options.pr,
			baseBranch: options.baseBranch,
			skipBranchPrefix: options.skipBranchPrefix ?? undefined,
			agents,
			command: options.command ?? undefined,
			...(options.tag?.length ? { tags: options.tag } : {}),
		});

		return {
			data: result,
			message: result.alreadyExists
				? `Reused existing workspace "${result.workspace.name}" on host ${target.hostId}`
				: `Created workspace "${result.workspace.name}" on host ${target.hostId}`,
		};
	},
});
