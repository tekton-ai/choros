import {
	closeSync,
	mkdirSync,
	openSync,
	readFileSync,
	unlinkSync,
	writeSync,
} from "node:fs";
import { join } from "node:path";
import { getHostId } from "@choros/shared/host-info";
import { isProcessAlive, manifestDir } from "./host-service-manifest";

export interface SpawnLock {
	ownerPid: number;
	machineId: string;
	acquiredAt: number;
}

export interface SpawnLockHandle {
	release(): void;
}

function lockPath(): string {
	return join(manifestDir(), "spawn.lock");
}

export function readSpawnLock(): SpawnLock | null {
	try {
		const data = JSON.parse(readFileSync(lockPath(), "utf-8"));
		if (
			typeof data.ownerPid !== "number" ||
			typeof data.machineId !== "string" ||
			typeof data.acquiredAt !== "number"
		) {
			return null;
		}
		return data as SpawnLock;
	} catch {
		return null;
	}
}

function removeLock(): void {
	try {
		unlinkSync(lockPath());
	} catch {
		// Already gone.
	}
}

function tryCreateLock(): SpawnLockHandle | null {
	try {
		mkdirSync(manifestDir(), { recursive: true, mode: 0o700 });
	} catch {
		// openSync below surfaces a real failure.
	}

	let fd: number;
	try {
		fd = openSync(lockPath(), "wx", 0o600);
	} catch {
		return null;
	}

	try {
		writeSync(
			fd,
			JSON.stringify({
				ownerPid: process.pid,
				machineId: getHostId(),
				acquiredAt: Date.now(),
			} satisfies SpawnLock),
		);
	} finally {
		try {
			closeSync(fd);
		} catch {}
	}

	return { release: removeLock };
}

export function acquireSpawnLock({
	staleMs,
}: {
	staleMs: number;
}): SpawnLockHandle | null {
	const handle = tryCreateLock();
	if (handle) return handle;

	const existing = readSpawnLock();
	const stealable =
		!existing ||
		!isProcessAlive(existing.ownerPid) ||
		Date.now() - existing.acquiredAt > staleMs;
	if (!stealable) return null;

	removeLock();
	return tryCreateLock();
}
