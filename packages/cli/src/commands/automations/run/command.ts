import { positional } from "@choros/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { requestIdOption, resolveRequestId } from "../shared";

export default command({
	description:
		"Run an Automation once without changing its schedule or round count",
	args: [positional("id").required().desc("Automation UUID")],
	options: { requestId: requestIdOption() },
	run: async ({ args, options }) => {
		const { client } = await resolveHostTarget();
		return {
			data: await client.automations.runNow.mutate({
				id: args.id as string,
				requestId: resolveRequestId(options.requestId),
			}),
		};
	},
});
