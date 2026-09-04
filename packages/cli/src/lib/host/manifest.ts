import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { CHOROS_HOME_DIR } from "../config";

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

export function ensureManifestDir(): string {
	const dir = manifestDir();
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
	return dir;
}

export function writeManifest(manifest: HostServiceManifest): void {
	ensureManifestDir();
	const path = manifestPath();
	writeFileSync(path, JSON.stringify(manifest, null, 2), { mode: 0o600 });
	chmodSync(path, 0o600);
}

export function readManifest(): HostServiceManifest | null {
	const path = manifestPath();
	if (!existsSync(path)) return null;
	try {
		const value = JSON.parse(
			readFileSync(path, "utf8"),
		) as Partial<HostServiceManifest>;
		if (
			typeof value.pid !== "number" ||
			typeof value.endpoint !== "string" ||
			typeof value.authToken !== "string" ||
			typeof value.startedAt !== "number"
		) {
			return null;
		}
		return value as HostServiceManifest;
	} catch {
		return null;
	}
}

export function removeManifest(): void {
	const path = manifestPath();
	if (existsSync(path)) rmSync(path);
}

export function isProcessAlive(pid: number): boolean {
	if (!Number.isSafeInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

export function hostDbPath(): string {
	return join(manifestDir(), "host.db");
}
