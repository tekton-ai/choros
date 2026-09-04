import {
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface PtyDaemonManifest {
	pid: number;
	socketPath: string;
	protocolVersions: number[];
	startedAt: number;
	handoffInProgress?: boolean;
	handoffSnapshotPath?: string;
	handoffSuccessorPid?: number;
}

export function isTestRunnerContext(
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	return env.NODE_ENV === "test" || env.NODE_TEST_CONTEXT !== undefined;
}

export function assertIsolatedDaemonNamespaceInTests(
	env: NodeJS.ProcessEnv = process.env,
): void {
	if (!isTestRunnerContext(env)) return;
	const home = env.CHOROS_HOME_DIR;
	const defaultHome = join(homedir(), ".choros");
	if (!home || resolve(home) === resolve(defaultHome)) {
		throw new Error(
			"refusing to touch the default ~/.choros daemon namespace from a " +
				"test: set CHOROS_HOME_DIR to an isolated temp dir (and " +
				"CHOROS_PTY_DAEMON_SOCKET to a temp socket) before using the " +
				"daemon layer.",
		);
	}
}

function chorosHomeDir(): string {
	assertIsolatedDaemonNamespaceInTests();
	return process.env.CHOROS_HOME_DIR || join(homedir(), ".choros");
}

export function ptyDaemonManifestDir(): string {
	return join(chorosHomeDir(), "host");
}

function ptyDaemonManifestPath(): string {
	return join(ptyDaemonManifestDir(), "pty-daemon-manifest.json");
}

export function writePtyDaemonManifest(manifest: PtyDaemonManifest): void {
	const dir = ptyDaemonManifestDir();
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
	writeFileSync(ptyDaemonManifestPath(), JSON.stringify(manifest), {
		encoding: "utf-8",
		mode: 0o600,
	});
}

export function readPtyDaemonManifest(): PtyDaemonManifest | null {
	const filePath = ptyDaemonManifestPath();
	if (!existsSync(filePath)) return null;
	try {
		const data = JSON.parse(readFileSync(filePath, "utf-8"));
		if (
			typeof data.pid !== "number" ||
			typeof data.socketPath !== "string" ||
			!Array.isArray(data.protocolVersions) ||
			typeof data.startedAt !== "number"
		) {
			return null;
		}
		const manifest: PtyDaemonManifest = {
			pid: data.pid,
			socketPath: data.socketPath,
			protocolVersions: data.protocolVersions,
			startedAt: data.startedAt,
		};
		if (typeof data.handoffInProgress === "boolean") {
			manifest.handoffInProgress = data.handoffInProgress;
		}
		if (typeof data.handoffSnapshotPath === "string") {
			manifest.handoffSnapshotPath = data.handoffSnapshotPath;
		}
		if (typeof data.handoffSuccessorPid === "number") {
			manifest.handoffSuccessorPid = data.handoffSuccessorPid;
		}
		return manifest;
	} catch {
		return null;
	}
}

export function listPtyDaemonManifests(): PtyDaemonManifest[] {
	const manifest = readPtyDaemonManifest();
	return manifest ? [manifest] : [];
}

export function removePtyDaemonManifest(): void {
	try {
		if (existsSync(ptyDaemonManifestPath()))
			unlinkSync(ptyDaemonManifestPath());
	} catch {
		// Best-effort removal.
	}
}

export function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}
