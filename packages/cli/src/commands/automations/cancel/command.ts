import { positional } from "@choros/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { requestIdOption, resolveRequestId } from "../shared";

export default command({
	description: "Request cancellation of a run's owned execution",
	args: [positional("runId").required().desc("Run UUID")],
	options: { requestId: requestIdOption() },
	run: async ({ args, options }) => {
		const { client } = await resolveHostTarget();
		return {
			data: await client.executions.requestCancel.mutate({
				runId: args.runId as string,
				requestId: resolveRequestId(options.requestId),
			}),
		};
	},
});
