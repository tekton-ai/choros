import { getHostId } from "@choros/shared/host-info";
import { formatDistanceToNowStrict } from "date-fns";
import { command } from "../../lib/command";
import { isProcessAlive, readManifest } from "../../lib/host/manifest";

async function checkHealth(
	endpoint: string,
	authToken: string,
): Promise<boolean> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 2_000);
	try {
		const response = await fetch(`${endpoint}/trpc/health.check`, {
			signal: controller.signal,
			headers: { Authorization: `Bearer ${authToken}` },
		});
		return response.ok;
	} catch {
		return false;
	} finally {
		clearTimeout(timeout);
	}
}

export default command({
	description: "Check the local host service status",
	run: async () => {
		const hostId = getHostId();
		const manifest = readManifest();
		if (!manifest) {
			return {
				data: { running: false, hostId },
				message: `Not running (hostId ${hostId})`,
			};
		}
		if (!isProcessAlive(manifest.pid)) {
			return {
				data: { running: false, stale: true, pid: manifest.pid, hostId },
				message: `Stale manifest (pid ${manifest.pid} is dead)`,
			};
		}
		const healthy = await checkHealth(manifest.endpoint, manifest.authToken);
		const uptime = formatDistanceToNowStrict(new Date(manifest.startedAt));
		return {
			data: {
				running: true,
				healthy,
				pid: manifest.pid,
				port: Number.parseInt(new URL(manifest.endpoint).port || "0", 10),
				endpoint: manifest.endpoint,
				hostId,
				uptimeSec: Math.floor((Date.now() - manifest.startedAt) / 1000),
			},
			message: `Local host ${hostId.slice(0, 8)}… running (pid ${manifest.pid}, up ${uptime})${healthy ? "" : " — not responding to health check"}`,
		};
	},
});
