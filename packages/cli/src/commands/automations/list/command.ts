import { string, table } from "@choros/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { paginationOptions } from "../shared";

export default command({
	description: "List Automations stored by the local Host",
	options: {
		...paginationOptions,
		state: string()
			.enum("paused", "enabled", "finished", "archived")
			.desc("Filter by schedule state"),
		project: string().variadic().desc("Filter by project UUID; repeatable"),
		workspace: string().variadic().desc("Filter by workspace UUID; repeatable"),
	},
	display: (data) => {
		const page = data as { items?: Array<Record<string, unknown>> };
		return table(
			(page.items ?? []).map((item) => {
				const definition = item.definition as { name?: string } | undefined;
				return { ...item, name: definition?.name ?? "" };
			}),
			["name", "state", "nextRunAt", "usedRounds", "id"],
			["NAME", "STATE", "NEXT RUN", "ROUNDS", "ID"],
			[28, 12, 25, 8, 36],
		);
	},
	run: async ({ options }) => {
		const { client } = await resolveHostTarget();
		return {
			data: await client.automations.list.query({
				state: options.state,
				limit: options.limit ?? 50,
				cursor: options.cursor,
				projectIds: options.project,
				workspaceIds: options.workspace,
			}),
		};
	},
});
