import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import {
	confirmationTokenOption,
	requestIdOption,
	resolveRequestId,
	runImmediatelyOption,
} from "../shared";

export default command({
	description: "Save a confirmed Automation in the paused state",
	options: {
		confirmationToken: confirmationTokenOption(),
		requestId: requestIdOption(),
		runImmediately: runImmediatelyOption(),
	},
	run: async ({ options }) => {
		const { client } = await resolveHostTarget();
		return {
			data: await client.automations.create.mutate({
				requestId: resolveRequestId(options.requestId),
				confirmationToken: options.confirmationToken,
				runImmediately: options.runImmediately ?? false,
			}),
		};
	},
});
