import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { CHOROS_HOME_DIR } from "./app-environment";

export interface HostServiceManifest {
	pid: number;
	endpoint: string;
	authToken: string;
	startedAt: number;
}

export function manifestDir(): string {
	return join(CHOROS_HOME_DIR, "host");
}

function manifestPath(): string {
	return join(manifestDir(), "manifest.json");
}

export function writeManifest(manifest: HostServiceManifest): void {
	const dir = manifestDir();
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
	}
	const finalPath = manifestPath();
	const tempPath = `${finalPath}.${process.pid}.tmp`;
	writeFileSync(tempPath, JSON.stringify(manifest), {
		encoding: "utf-8",
		mode: 0o600,
	});
	renameSync(tempPath, finalPath);
}

export function readManifest(): HostServiceManifest | null {
	const filePath = manifestPath();
	if (!existsSync(filePath)) return null;

	try {
		const data = JSON.parse(readFileSync(filePath, "utf-8"));
		if (
			typeof data.pid !== "number" ||
			typeof data.endpoint !== "string" ||
			typeof data.authToken !== "string" ||
			typeof data.startedAt !== "number"
		) {
			return null;
		}
		return data as HostServiceManifest;
	} catch {
		return null;
	}
}

export async function shouldYieldManifest(
	existing: HostServiceManifest | null,
	selfPid: number,
	deps: {
		isAlive: (pid: number) => boolean;
		probeHealthy: (endpoint: string, authToken: string) => Promise<boolean>;
	},
): Promise<boolean> {
	if (!existing || existing.pid === selfPid) return false;
	if (!deps.isAlive(existing.pid)) return false;
	return deps.probeHealthy(existing.endpoint, existing.authToken);
}

export function removeManifest(): void {
	try {
		if (existsSync(manifestPath())) unlinkSync(manifestPath());
	} catch {
		// Best-effort removal.
	}
}

export function isProcessAlive(pid: number): boolean {
	if (!isSignalablePid(pid)) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

export function killProcess(
	pid: number,
	signal: NodeJS.Signals | number,
): void {
	if (!isSignalablePid(pid)) {
		throw new Error(`Refusing to signal invalid pid: ${pid}`);
	}
	process.kill(pid, signal);
}

function isSignalablePid(pid: number): boolean {
	return Number.isSafeInteger(pid) && pid > 0 && pid !== process.pid;
}
