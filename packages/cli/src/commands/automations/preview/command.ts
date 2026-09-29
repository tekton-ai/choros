import { CLIError, number, string } from "@choros/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { definitionOptions, parseAutomationDefinition } from "../shared";

export default command({
	description: "Validate and preview an Automation without saving it",
	options: {
		...definitionOptions,
		id: string().desc(
			"Existing Automation UUID when previewing an update or enable",
		),
		expectedVersion: number()
			.int()
			.desc("Current Automation version for an update or enable preview"),
		intent: string()
			.enum("save", "enable", "run")
			.desc("Confirmation purpose (default: save)"),
	},
	run: async ({ options }) => {
		if (
			(options.id === undefined) !==
			(options.expectedVersion === undefined)
		) {
			throw new CLIError(
				"--id and --expected-version must be provided together",
			);
		}
		const { client } = await resolveHostTarget();
		return {
			data: await client.automations.preview.query({
				definition: parseAutomationDefinition(options),
				automationId: options.id,
				expectedVersion: options.expectedVersion,
				intent: options.intent ?? "save",
			}),
		};
	},
});
