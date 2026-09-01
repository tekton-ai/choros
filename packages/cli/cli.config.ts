import { boolean, defineConfig, string } from "@choros/cli-framework";
import pkg from "./package.json" with { type: "json" };

const VERSION = pkg.version;

export default defineConfig({
	name: "choros",
	version: VERSION,
	commandsDir: "./src/commands",
	outfile: "./dist/choros",
	define: {
		"process.env.RELAY_URL": JSON.stringify(
			process.env.RELAY_URL ?? "https://relay.choros.sh",
		),
		"process.env.SUPERSET_API_URL": JSON.stringify(
			process.env.SUPERSET_API_URL ?? "https://api.choros.sh",
		),
		"process.env.SUPERSET_WEB_URL": JSON.stringify(
			process.env.SUPERSET_WEB_URL ?? "https://app.choros.sh",
		),
		"process.env.SUPERSET_VERSION": JSON.stringify(VERSION),
		"process.env.SUPERSET_CLI_CHANNEL": JSON.stringify(
			process.env.SUPERSET_CLI_CHANNEL ?? "standalone",
		),
	},
	globals: {
		json: boolean().desc("Output as JSON (auto-on under CI/agent envs)"),
		quiet: boolean().desc("Output IDs only"),
		apiKey: string()
			.env("SUPERSET_API_KEY")
			.desc("Use a Choros API key (sk_live_…) instead of OAuth login"),
	},
	help: {
		tagline: "Command your fleet of coding agents from any shell.",
		docsUrl: "https://docs.choros.sh/cli",
		tip: "Agents in Choros terminals already have `choros` on PATH — tell them to use it.",
		sections: [
			{
				title: "Workspaces & agents",
				commands: ["workspaces", "agents", "terminals", "scripts"],
			},
			{ title: "Tasks & automations", commands: ["tasks", "automations"] },
			{ title: "Pages", commands: ["pages"] },
			{
				title: "Hosts & projects",
				commands: ["hosts", "projects", "start", "status", "stop"],
			},
			{
				title: "Account & app",
				commands: ["auth", "organization", "settings", "update", "feedback"],
			},
		],
		examples: [
			{
				cmd: 'choros ws create --project <id> --name fix-tests --branch fix-tests --agent claude --prompt "fix the flaky tests"',
				desc: "Spin up an isolated workspace and put an agent to work",
			},
			{
				cmd: "choros terminals read --workspace <id> --terminal <id>",
				desc: "Peek at what an agent is doing right now",
			},
			{
				cmd: 'choros automations create --name nightly-audit --project <id> --rrule "FREQ=DAILY" --prompt "audit deps"',
				desc: "Schedule a recurring agent run",
			},
		],
	},
});
