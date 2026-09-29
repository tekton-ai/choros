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
		"Resume a paused Automation using an enable-purpose preview token",
	args: [positional("id").required().desc("Automation UUID")],
	options: {
		expectedVersion: expectedVersionOption(),
		confirmationToken: confirmationTokenOption(),
		requestId: requestIdOption(),
	},
	run: async ({ args, options }) => {
		const { client } = await resolveHostTarget();
		return {
			data: await client.automations.setScheduleState.mutate({
				id: args.id as string,
				expectedVersion: options.expectedVersion,
				requestId: resolveRequestId(options.requestId),
				state: "enabled",
				confirmationToken: options.confirmationToken,
			}),
		};
	},
});
