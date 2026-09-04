import { existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { DaemonSupervisor } from "./daemon-supervisor.ts";

let supervisor: DaemonSupervisor | null = null;
let bootstrapPromise: Promise<unknown> | null = null;

export function resolveSupervisorScriptPath(): string {
	const override = process.env.CHOROS_PTY_DAEMON_SCRIPT_PATH;
	if (override) return override;
	const here = path.dirname(fileURLToPath(import.meta.url));
	const sideBySide = path.resolve(here, "pty-daemon.js");
	if (existsSync(sideBySide)) return sideBySide;
	return path.resolve(
		here,
		"..",
		"..",
		"..",
		"pty-daemon",
		"dist",
		"pty-daemon.js",
	);
}

export function getSupervisor(scriptPath?: string): DaemonSupervisor {
	if (!supervisor) {
		supervisor = new DaemonSupervisor({
			scriptPath: scriptPath ?? resolveSupervisorScriptPath(),
		});
	}
	return supervisor;
}

export function startDaemonBootstrap(): void {
	if (bootstrapPromise) return;
	const instance = getSupervisor();
	console.log("[supervisor] kicking off daemon bootstrap");
	bootstrapPromise = instance
		.ensure()
		.then((daemon) => {
			console.log(
				`[supervisor] bootstrap OK pid=${daemon.pid} version=${daemon.runningVersion}${daemon.updatePending ? " (update pending)" : ""}`,
			);
			return daemon;
		})
		.catch((error) => {
			console.error("[supervisor] bootstrap failed:", error);
			bootstrapPromise = null;
			throw error;
		});
}

export async function waitForDaemonReady(): Promise<void> {
	if (!bootstrapPromise) startDaemonBootstrap();
	if (bootstrapPromise) await bootstrapPromise;
	await getSupervisor().ensure();
}

export function __resetSupervisorForTesting(): void {
	supervisor = null;
	bootstrapPromise = null;
}
