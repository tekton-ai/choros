import { boolean, CLIError, positional, string } from "@choros/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";

export default command({
	description: "Update a workspace on a host (default: this machine)",
	args: [positional("id").required().desc("Workspace UUID")],
	options: {
		name: string().desc("Workspace name"),
		tag: string()
			.variadic()
			.desc(
				"Replace the workspace's tag set. Repeatable. Each tag files the workspace into a sidebar folder of the same name",
			),
		clearTags: boolean().desc("Remove every tag from the workspace"),
	},
	run: async ({ args, options }) => {
		const id = args.id as string;

		if (options.tag?.length && options.clearTags) {
			throw new CLIError(
				"Cannot combine --tag and --clear-tags",
				"Pass one or the other",
			);
		}

		// --tag replaces the whole set (the host semantic); --clear-tags is [].
		const tags = options.clearTags
			? []
			: options.tag?.length
				? options.tag
				: undefined;

		if (options.name === undefined && tags === undefined) {
			throw new CLIError(
				"No fields to update",
				"Pass --name, --tag, or --clear-tags",
			);
		}

		const target = await resolveHostTarget();
		const updated = await target.client.workspace.update.mutate({
			id,
			...(options.name !== undefined ? { name: options.name } : {}),
			...(tags !== undefined ? { tags } : {}),
		});

		return {
			data: updated,
			message: `Updated workspace ${id}`,
		};
	},
});
