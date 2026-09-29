import type { HarnessToolDefinition } from "@choros/chat-runtime";
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
	executionAnswerInputSchema,
	executionCancelInputSchema,
	workEventsInputSchema,
} from "@choros/shared/automation-contracts";
import { z } from "zod";

export type AutomationToolSourceContext = {
	kind: "chat";
	sessionId: string;
	scopeId: string;
};

type Tool = HarnessToolDefinition;

function managementTool(
	name: string,
	description: string,
	inputSchema: Tool["inputSchema"],
	handler: Tool["handler"],
	requiresApproval = true,
): Tool {
	return {
		name,
		description,
		inputSchema,
		requiresApproval,
		handler,
	};
}

/**
 * Native provider tools for an authenticated interactive chat session. The
 * client is captured by the Host, so models cannot select another Host or
 * supply an execution identity. Mutations remain individual provider approval
 * requests; an "allow for session" response is normalized to one approval by
 * the harness adapter.
 */
export function createAutomationManagementTools(
	client: AutomationClient,
	sourceContext: AutomationToolSourceContext,
): HarnessToolDefinition[] {
	const source = `${sourceContext.kind}:${sourceContext.scopeId}:${sourceContext.sessionId}`;
	return [
		managementTool(
			"automations_capabilities",
			`Read the Automation capabilities for this Host. Source: ${source}`,
			z.object({}),
			async () => client.capabilities(),
			false,
		),
		managementTool(
			"automations_preview",
			"Validate and preview an Automation definition. This is read-only and returns the exact confirmation token required by a later mutation.",
			automationPreviewInputSchema,
			async (input) =>
				client.preview(automationPreviewInputSchema.parse(input)),
			false,
		),
		managementTool(
			"automations_create",
			"Create the exact Automation represented by a prior preview token. New scheduled Automations are paused unless a separately approved operation enables them.",
			automationCreateInputSchema,
			async (input) => client.create(automationCreateInputSchema.parse(input)),
		),
		managementTool(
			"automations_update",
			"Update an Automation using an exact preview token and expected version.",
			automationUpdateInputSchema,
			async (input) => client.update(automationUpdateInputSchema.parse(input)),
		),
		managementTool(
			"automations_set_schedule_state",
			"Enable, pause, or resume one Automation. This approval applies only to this exact request.",
			automationSetStateInputSchema,
			async (input) =>
				client.setScheduleState(automationSetStateInputSchema.parse(input)),
		),
		managementTool(
			"automations_archive",
			"Archive one Automation while preserving history and any active execution.",
			automationArchiveInputSchema,
			async (input) =>
				client.archive(automationArchiveInputSchema.parse(input)),
		),
		managementTool(
			"automations_run_now",
			"Run the current Automation definition once without changing its schedule.",
			automationRunNowInputSchema,
			async (input) => client.runNow(automationRunNowInputSchema.parse(input)),
		),
		managementTool(
			"automations_retry_run",
			"Create a new retry Run from the selected historical Run snapshot.",
			automationRetryInputSchema,
			async (input) => client.retryRun(automationRetryInputSchema.parse(input)),
		),
		managementTool(
			"automations_get",
			"Read one Automation without starting work.",
			z.object({ id: z.string().uuid() }),
			async (input) =>
				client.get(z.object({ id: z.string().uuid() }).parse(input)),
			false,
		),
		managementTool(
			"automations_list",
			"List Automations without starting work.",
			automationListInputSchema.unwrap(),
			async (input) => client.list(automationListInputSchema.parse(input)),
			false,
		),
		managementTool(
			"automations_get_run",
			"Read one Automation Run and its persisted result without starting work.",
			z.object({ id: z.string().uuid() }),
			async (input) =>
				client.getRun(z.object({ id: z.string().uuid() }).parse(input)),
			false,
		),
		managementTool(
			"automations_list_runs",
			"List Automation Run history without starting work.",
			automationRunsInputSchema.unwrap(),
			async (input) => client.listRuns(automationRunsInputSchema.parse(input)),
			false,
		),
		managementTool(
			"automations_read_events",
			"Read persisted Automation change events after a cursor.",
			workEventsInputSchema.unwrap(),
			async (input) => client.readEvents(workEventsInputSchema.parse(input)),
			false,
		),
		managementTool(
			"executions_request_cancel",
			"Request cancellation of one Run. Acceptance is not proof that its provider process has stopped.",
			executionCancelInputSchema,
			async (input) =>
				client.requestCancel(executionCancelInputSchema.parse(input)),
		),
		managementTool(
			"executions_answer_input",
			"Answer exactly one pending execution input at its expected version.",
			executionAnswerInputSchema,
			async (input) =>
				client.answerInput(executionAnswerInputSchema.parse(input)),
		),
	];
}
