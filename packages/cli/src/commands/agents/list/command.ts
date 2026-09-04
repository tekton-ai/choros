import { table } from "@choros/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";

export default command({
	description: "List agents configured on a host",
	display: (data) =>
		table(
			(data ?? []) as Record<string, unknown>[],
			["label", "presetId", "command", "id"],
			["LABEL", "PRESET", "COMMAND", "ID"],
		),
	run: async () => {
		const target = await resolveHostTarget();

		return await target.client.settings.agentConfigs.list.query();
	},
});
