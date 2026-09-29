import {
	type AutomationClient,
	executionAnswerInputSchema,
	executionCancelInputSchema,
} from "@choros/shared/automation-contracts";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";
import { invokeAutomation } from "../automations/automation-error";

function client(ctx: HostServiceContext): AutomationClient {
	return ctx.runtime.automations;
}

export const executionsRouter = router({
	requestCancel: protectedProcedure
		.input(executionCancelInputSchema)
		.mutation(({ ctx, input }) =>
			invokeAutomation(() => client(ctx).requestCancel(input)),
		),
	answerInput: protectedProcedure
		.input(executionAnswerInputSchema)
		.mutation(({ ctx, input }) =>
			invokeAutomation(() => client(ctx).answerInput(input)),
		),
});
