import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";

export default command({
	description: "Show Automation capabilities supported by this local Host",
	run: async () => {
		const { client } = await resolveHostTarget();
		return { data: await client.automations.capabilities.query() };
	},
});
