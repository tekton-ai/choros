import {
	type AutomationClient,
	automationArchiveInputSchema,
	automationCreateInputSchema,
	automationListInputSchema,
	automationPreviewInputSchema,
	automationRetryInputSchema,
	automationRunNowInputSchema,
	automationRunsInputSchema,
	automationSetStateInputSchema,
	automationUpdateInputSchema,
	workEventsInputSchema,
} from "@choros/shared/automation-contracts";
import { z } from "zod";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, queryProcedure, router } from "../../index";
import { invokeAutomation } from "./automation-error";

function client(ctx: HostServiceContext): AutomationClient {
	return ctx.runtime.automations;
}

export const automationsRouter = router({
	capabilities: queryProcedure.query(({ ctx }) =>
		invokeAutomation(() => client(ctx).capabilities()),
	),
	preview: queryProcedure
		.input(automationPreviewInputSchema)
		.query(({ ctx, input }) =>
			invokeAutomation(() => client(ctx).preview(input)),
		),
	create: protectedProcedure
		.input(automationCreateInputSchema)
		.mutation(({ ctx, input }) =>
			invokeAutomation(() => client(ctx).create(input)),
		),
	update: protectedProcedure
		.input(automationUpdateInputSchema)
		.mutation(({ ctx, input }) =>
			invokeAutomation(() => client(ctx).update(input)),
		),
	setScheduleState: protectedProcedure
		.input(automationSetStateInputSchema)
		.mutation(({ ctx, input }) =>
			invokeAutomation(() => client(ctx).setScheduleState(input)),
		),
	archive: protectedProcedure
		.input(automationArchiveInputSchema)
		.mutation(({ ctx, input }) =>
			invokeAutomation(() => client(ctx).archive(input)),
		),
	runNow: protectedProcedure
		.input(automationRunNowInputSchema)
		.mutation(({ ctx, input }) =>
			invokeAutomation(() => client(ctx).runNow(input)),
		),
	retryRun: protectedProcedure
		.input(automationRetryInputSchema)
		.mutation(({ ctx, input }) =>
			invokeAutomation(() => client(ctx).retryRun(input)),
		),
	get: queryProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(({ ctx, input }) => invokeAutomation(() => client(ctx).get(input))),
	list: queryProcedure
		.input(automationListInputSchema.optional())
		.query(({ ctx, input }) => invokeAutomation(() => client(ctx).list(input))),
	getRun: queryProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(({ ctx, input }) =>
			invokeAutomation(() => client(ctx).getRun(input)),
		),
	listRuns: queryProcedure
		.input(automationRunsInputSchema.optional())
		.query(({ ctx, input }) =>
			invokeAutomation(() => client(ctx).listRuns(input)),
		),
	readEvents: queryProcedure
		.input(workEventsInputSchema.optional())
		.query(({ ctx, input }) =>
			invokeAutomation(() => client(ctx).readEvents(input)),
		),
});
