import { boolean, CLIError, number } from "@choros/cli-framework";
import * as p from "@clack/prompts";
import { command } from "../../lib/command";
import { isProcessAlive, readManifest } from "../../lib/host/manifest";
import { spawnHostService } from "../../lib/host/spawn";

export default command({
	description: "Start the local host service",
	options: {
		daemon: boolean().desc("Run in background"),
		port: number().desc("Port to listen on"),
	},
	run: async ({ options, signal }) => {
		const existing = readManifest();
		if (existing && isProcessAlive(existing.pid)) {
			return {
				data: { pid: existing.pid, endpoint: existing.endpoint },
				message: `Host service already running (pid ${existing.pid})`,
			};
		}
		p.intro("choros start");
		const spinner = p.spinner();
		spinner.start("Starting local host service...");
		try {
			const result = await spawnHostService({
				port: options.port,
				daemon: options.daemon ?? false,
			});
			spinner.stop(
				`Host service running on port ${result.port} (pid ${result.pid})`,
			);
			if (options.daemon) {
				p.outro("Running in background.");
				return {
					data: { pid: result.pid, port: result.port },
					message: "Local host service started",
				};
			}
			p.outro("Press Ctrl+C to stop.");
			await new Promise<void>((resolve) => {
				signal.addEventListener("abort", () => resolve(), { once: true });
			});
			return {
				data: { pid: result.pid, port: result.port },
				message: "Local host service stopped",
			};
		} catch (error) {
			spinner.stop("Failed to start host service");
			throw new CLIError(
				error instanceof Error ? error.message : "Unknown error",
			);
		}
	},
});
