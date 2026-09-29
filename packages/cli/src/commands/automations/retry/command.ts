import { positional } from "@choros/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { requestIdOption, resolveRequestId } from "../shared";

export default command({
	description: "Retry a historical run from its saved definition snapshot",
	args: [positional("runId").required().desc("Run UUID")],
	options: { requestId: requestIdOption() },
	run: async ({ args, options }) => {
		const { client } = await resolveHostTarget();
		return {
			data: await client.automations.retryRun.mutate({
				runId: args.runId as string,
				requestId: resolveRequestId(options.requestId),
			}),
		};
	},
});
