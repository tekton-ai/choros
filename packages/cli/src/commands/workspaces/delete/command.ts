import { positional } from "@choros/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";

export default command({
	description: "Delete workspaces by ID on a host (default: this machine)",
	args: [positional("ids").required().variadic().desc("Workspace IDs")],
	run: async ({ args }) => {
		const ids = args.ids as string[];
		const target = await resolveHostTarget();

		const deleted: string[] = [];
		const warnings: string[] = [];
		for (const id of ids) {
			const result = await target.client.workspace.delete.mutate({ id });
			deleted.push(id);
			for (const warning of result.warnings ?? []) {
				warnings.push(`${id}: ${warning}`);
			}
		}

		const deleteMessage =
			deleted.length === 1
				? `Deleted workspace ${deleted[0]}`
				: `Deleted ${deleted.length} workspaces`;
		return {
			data: { deleted, warnings },
			message:
				warnings.length > 0
					? `${deleteMessage}\nWarnings:\n${warnings.map((warning) => `- ${warning}`).join("\n")}`
					: deleteMessage,
		};
	},
});
