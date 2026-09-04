import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import {
	MAX_HOST_LOG_BYTES,
	openRotatingLogFd,
} from "@choros/shared/rotating-log";
import { CHOROS_HOME_DIR } from "../config";
import { isDesktopBundled } from "../env";
import {
	ensureManifestDir,
	type HostServiceManifest,
	hostDbPath,
	writeManifest,
} from "./manifest";

const HEALTH_POLL_INTERVAL_MS = 200;
const HEALTH_POLL_TIMEOUT_MS = 10_000;

export interface SpawnHostOptions {
	port?: number;
	daemon: boolean;
}

export interface SpawnHostResult {
	pid: number;
	port: number;
	secret: string;
}

async function findFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				server.close(() => reject(new Error("Could not get port")));
				return;
			}
			server.close(() => resolve(address.port));
		});
		server.on("error", reject);
	});
}

async function pollHealth(port: number, secret: string): Promise<boolean> {
	const deadline = Date.now() + HEALTH_POLL_TIMEOUT_MS;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(
				`http://127.0.0.1:${port}/trpc/health.check`,
				{ headers: { Authorization: `Bearer ${secret}` } },
			);
			if (response.ok) return true;
		} catch {}
		await new Promise((resolve) =>
			setTimeout(resolve, HEALTH_POLL_INTERVAL_MS),
		);
	}
	return false;
}

function resolveHostBinary(): string {
	if (process.env.CHOROS_HOST_BIN) return process.env.CHOROS_HOST_BIN;
	return join(dirname(process.execPath), "choros-host");
}

function resolveMigrationsFolder(): string {
	if (process.env.HOST_MIGRATIONS_FOLDER) {
		return process.env.HOST_MIGRATIONS_FOLDER;
	}
	return join(dirname(dirname(process.execPath)), "share", "migrations");
}

export async function spawnHostService(
	options: SpawnHostOptions,
): Promise<SpawnHostResult> {
	const hostBin = resolveHostBinary();
	if (!existsSync(hostBin)) {
		if (isDesktopBundled()) {
			throw new Error(
				"`choros start` is unavailable in the desktop-bundled CLI because the app owns the host service.",
			);
		}
		throw new Error(
			`choros-host binary not found at ${hostBin}. Set CHOROS_HOST_BIN to override.`,
		);
	}
	const port = options.port ?? (await findFreePort());
	const secret = randomBytes(32).toString("hex");
	const logFd = options.daemon
		? openRotatingLogFd(
				join(ensureManifestDir(), "host-service.log"),
				MAX_HOST_LOG_BYTES,
			)
		: -1;
	const child = spawn(hostBin, [], {
		stdio: options.daemon
			? logFd === -1
				? "ignore"
				: ["ignore", logFd, logFd]
			: "inherit",
		detached: options.daemon,
		env: {
			...process.env,
			PORT: String(port),
			HOST_SERVICE_PORT: String(port),
			HOST_SERVICE_SECRET: secret,
			HOST_DB_PATH: hostDbPath(),
			HOST_MIGRATIONS_FOLDER: resolveMigrationsFolder(),
			CHOROS_HOME_DIR,
		},
	});
	if (logFd !== -1) closeSync(logFd);
	if (!child.pid) throw new Error("Failed to spawn host-service");
	if (!(await pollHealth(port, secret))) {
		child.kill("SIGTERM");
		throw new Error(
			`Host service failed to start within ${HEALTH_POLL_TIMEOUT_MS}ms`,
		);
	}
	const manifest: HostServiceManifest = {
		pid: child.pid,
		endpoint: `http://127.0.0.1:${port}`,
		authToken: secret,
		startedAt: Date.now(),
	};
	writeManifest(manifest);
	if (options.daemon) child.unref();
	return { pid: child.pid, port, secret };
}
