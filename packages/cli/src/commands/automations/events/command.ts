import { number } from "@choros/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";

export default command({
	description:
		"Read persisted Automation change events after a sequence cursor",
	options: {
		after: number().int().desc("Last seen event sequence (default 0)"),
		limit: number()
			.int()
			.desc("Number of events to return (1-100; default 50)"),
	},
	run: async ({ options }) => {
		const { client } = await resolveHostTarget();
		return {
			data: await client.automations.readEvents.query({
				after: options.after ?? 0,
				limit: options.limit ?? 50,
			}),
		};
	},
});
