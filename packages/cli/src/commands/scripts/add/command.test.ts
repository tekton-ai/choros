import { beforeEach, describe, expect, mock, test } from "bun:test";
import { readSettingsRow } from "../../../lib/settings";
import {
	createLocalSettingsDb,
	withTempChorosHome,
} from "../../../lib/settings/test-helpers";

mock.module("../../../lib/settings/notify", () => ({
	notifyDesktopSettingsChanged: async () => false,
}));

const { default: addScriptCommand } = await import("./command");
const { default: scriptsMeta } = await import("../meta");

const home = withTempChorosHome("choros-cli-script-command-");

function invoke(overrides: Record<string, unknown> = {}) {
	return addScriptCommand.run({
		ctx: {} as never,
		args: {} as never,
		options: {
			name: "Services",
			command: ["bun run api", "bun run web"],
			...overrides,
		} as never,
		signal: new AbortController().signal,
	});
}

beforeEach(() => {
	createLocalSettingsDb(home.dir);
});

describe("scripts add", () => {
	test("persists repeated commands and command options", async () => {
		const result = (await invoke({
			hidden: true,
			workspaceRun: true,
			executionMode: "new-tab-split-pane",
			project: ["a1b2c3d4-e5f6-7890-abcd-ef1234567890"],
		})) as {
			data: { commands: string[]; pinnedToBar: boolean };
			message: string;
		};

		expect(result.data.commands).toEqual(["bun run api", "bun run web"]);
		expect(result.data.pinnedToBar).toBe(false);
		expect(result.message).toContain("first matching script wins");
		expect(readSettingsRow()?.terminalPresets?.[0]).toMatchObject({
			projectIds: ["a1b2c3d4-e5f6-7890-abcd-ef1234567890"],
			useAsWorkspaceRun: true,
			executionMode: "new-tab-split-pane",
		});
	});

	test("rejects malformed project ids before writing", async () => {
		await expect(invoke({ project: ["not-a-uuid"] })).rejects.toThrow(
			/Invalid project UUID/,
		);
		expect(readSettingsRow()).toBeUndefined();
	});

	test("keeps presets as a compatibility alias", () => {
		expect(scriptsMeta.aliases).toContain("presets");
	});
});
