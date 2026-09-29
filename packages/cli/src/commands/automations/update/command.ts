import { positional } from "@choros/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import {
	confirmationTokenOption,
	expectedVersionOption,
	requestIdOption,
	resolveRequestId,
} from "../shared";

export default command({
	description:
		"Apply a confirmed Automation definition update (future runs pause)",
	args: [positional("id").required().desc("Automation UUID")],
	options: {
		expectedVersion: expectedVersionOption(),
		confirmationToken: confirmationTokenOption(),
		requestId: requestIdOption(),
	},
	run: async ({ args, options }) => {
		const { client } = await resolveHostTarget();
		return {
			data: await client.automations.update.mutate({
				id: args.id as string,
				expectedVersion: options.expectedVersion,
				confirmationToken: options.confirmationToken,
				requestId: resolveRequestId(options.requestId),
			}),
		};
	},
});
