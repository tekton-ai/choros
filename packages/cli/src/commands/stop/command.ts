import { CLIError } from "@choros/cli-framework";
import { command } from "../../lib/command";
import {
	isProcessAlive,
	readManifest,
	removeManifest,
} from "../../lib/host/manifest";

export default command({
	description: "Stop the local host service daemon",
	run: async () => {
		const manifest = readManifest();
		if (!manifest) {
			return { data: { running: false }, message: "No host service running" };
		}
		if (isProcessAlive(manifest.pid)) {
			try {
				process.kill(manifest.pid, "SIGTERM");
			} catch (error) {
				throw new CLIError(
					`Failed to stop host service (pid ${manifest.pid}): ${
						error instanceof Error ? error.message : "unknown error"
					}`,
				);
			}
			const deadline = Date.now() + 10_000;
			while (Date.now() < deadline && isProcessAlive(manifest.pid)) {
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
			if (isProcessAlive(manifest.pid)) process.kill(manifest.pid, "SIGKILL");
		}
		removeManifest();
		return {
			data: { pid: manifest.pid },
			message: "Stopped local host service",
		};
	},
});
