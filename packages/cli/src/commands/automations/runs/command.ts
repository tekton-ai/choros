import { positional, string, table } from "@choros/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { paginationOptions } from "../shared";

export default command({
	description: "List Automation runs and execution outcomes",
	args: [positional("automationId").desc("Optional Automation UUID")],
	options: {
		...paginationOptions,
		status: string()
			.enum(
				"preparing",
				"running",
				"waiting",
				"stopping",
				"succeeded",
				"failed",
				"skipped",
				"cancelled",
				"unknown",
				"needs_result",
			)
			.desc("Filter by run status"),
	},
	display: (data) => {
		const page = data as { items?: Array<Record<string, unknown>> };
		return table(
			page.items ?? [],
			["createdAt", "source", "status", "reason", "id"],
			["CREATED", "SOURCE", "STATUS", "REASON", "RUN ID"],
			[25, 10, 14, 28, 36],
		);
	},
	run: async ({ args, options }) => {
		const { client } = await resolveHostTarget();
		return {
			data: await client.automations.listRuns.query({
				automationId: args.automationId as string | undefined,
				status: options.status,
				limit: options.limit ?? 50,
				cursor: options.cursor,
			}),
		};
	},
});
