import { positional, string } from "@choros/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import {
	expectedVersionOption,
	readAnswer,
	requestIdOption,
	resolveRequestId,
} from "../shared";

export default command({
	description: "Answer a pending execution question or permission request",
	args: [positional("inputId").required().desc("Execution input UUID")],
	options: {
		expectedVersion: expectedVersionOption(),
		requestId: requestIdOption(),
		answer: string().desc("Answer text"),
		answerFile: string().desc("Read answer text from this file"),
	},
	run: async ({ args, options }) => {
		const { client } = await resolveHostTarget();
		return {
			data: await client.executions.answerInput.mutate({
				inputId: args.inputId as string,
				expectedVersion: options.expectedVersion,
				answer: readAnswer(options.answer, options.answerFile),
				requestId: resolveRequestId(options.requestId),
			}),
		};
	},
});
