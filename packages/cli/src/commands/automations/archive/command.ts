import { positional } from "@choros/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import {
	expectedVersionOption,
	requestIdOption,
	resolveRequestId,
} from "../shared";

export default command({
	description:
		"Archive an Automation while retaining runs and active execution facts",
	args: [positional("id").required().desc("Automation UUID")],
	options: {
		expectedVersion: expectedVersionOption(),
		requestId: requestIdOption(),
	},
	run: async ({ args, options }) => {
		const { client } = await resolveHostTarget();
		return {
			data: await client.automations.archive.mutate({
				id: args.id as string,
				expectedVersion: options.expectedVersion,
				requestId: resolveRequestId(options.requestId),
			}),
		};
	},
});
