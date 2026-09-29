import { positional, string } from "@choros/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import {
	expectedVersionOption,
	requestIdOption,
	resolveRequestId,
} from "../shared";

export default command({
	description:
		"Pause future Automation runs indefinitely or until an ISO instant",
	args: [positional("id").required().desc("Automation UUID")],
	options: {
		expectedVersion: expectedVersionOption(),
		requestId: requestIdOption(),
		until: string().desc(
			"ISO instant at which the schedule may automatically resume",
		),
	},
	run: async ({ args, options }) => {
		const { client } = await resolveHostTarget();
		return {
			data: await client.automations.setScheduleState.mutate({
				id: args.id as string,
				expectedVersion: options.expectedVersion,
				requestId: resolveRequestId(options.requestId),
				state: "paused",
				resumeAt: options.until ?? null,
			}),
		};
	},
});
