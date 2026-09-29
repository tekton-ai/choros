import { boolean, positional } from "@choros/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";

export default command({
	description: "Show one Automation or run with its full persisted details",
	args: [
		positional("id").required().desc("Automation UUID, or run UUID with --run"),
	],
	options: { run: boolean().desc("Treat id as a run UUID") },
	run: async ({ args, options }) => {
		const { client } = await resolveHostTarget();
		const input = { id: args.id as string };
		const data = options.run
			? await client.automations.getRun.query(input)
			: await client.automations.get.query(input);
		return { data };
	},
});
