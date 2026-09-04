import * as childProcess from "node:child_process";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import path from "node:path";
import { i18n } from "@choros/i18n";
import { getHostId, getHostName } from "@choros/shared/host-info";
import { app, dialog } from "electron";
import log from "electron-log/main";
import { env as sharedEnv } from "shared/env.shared";
import { getProcessEnvWithShellPath } from "../../lib/shell-env";
import { env as mainEnv } from "../env.main";
import { CHOROS_HOME_DIR } from "./app-environment";
import { getBrowserBridgeInfo } from "./browser/browser-bridge-info";
import { acquireSpawnLock } from "./host-service-lock";
import {
	isProcessAlive,
	killProcess,
	manifestDir,
	readManifest,
	removeManifest,
} from "./host-service-manifest";
import {
	HOST_SERVICE_RESPAWN_STABLE_MS,
	nextRespawnDelayMs,
} from "./host-service-respawn";
import {
	findFreePort,
	HEALTH_POLL_TIMEOUT_MS,
	MAX_HOST_LOG_BYTES,
	openRotatingLogFd,
	pollHealthCheck,
} from "./host-service-utils";
import { HOOK_PROTOCOL_VERSION } from "./terminal/env";

export type HostServiceStatus = "starting" | "running" | "stopped";

export interface Connection {
	port: number;
	secret: string;
	machineId: string;
}

export interface HostServiceStatusEvent {
	status: HostServiceStatus;
	previousStatus: HostServiceStatus | null;
}

interface RespawnState {
	attempts: number;
	timer: ReturnType<typeof setTimeout> | null;
	stableTimer: ReturnType<typeof setTimeout> | null;
}

interface HostServiceProcess {
	pid: number;
	port: number;
	secret: string;
	status: HostServiceStatus;
	spawnedAt: number;
	outputTail: string;
	redactions: string[];
	owned: boolean;
}

interface PendingStart {
	generation: number;
	promise: Promise<Connection>;
}

const ADOPT_HEALTH_TIMEOUT_MS = 2_500;
const SPAWN_LOCK_STALE_MS = HEALTH_POLL_TIMEOUT_MS + 5_000;
const START_OR_ADOPT_DEADLINE_MS = SPAWN_LOCK_STALE_MS + HEALTH_POLL_TIMEOUT_MS;
const ADOPT_WAIT_INTERVAL_MS = 250;
const MAX_OUTPUT_TAIL_BYTES = 16_384;
const CRASH_REPORT_FLUSH_MS = 500;
const STABLE_PORT = 48_000;

function isValidPort(port: number | null | undefined): port is number {
	return (
		typeof port === "number" &&
		Number.isInteger(port) &&
		port > 0 &&
		port <= 65_535
	);
}

export class HostServiceCoordinator extends EventEmitter {
	private instance: HostServiceProcess | null = null;
	private pendingStart: PendingStart | null = null;
	private lastKnownPort: number | null = null;
	private stableSecret: string | null = null;
	private scriptPath = path.join(__dirname, "host-service.js");
	private readonly machineId = getHostId();
	private devReloadWatcher: fs.FSWatcher | null = null;
	private respawnState: RespawnState | null = null;
	private desired = false;
	private startGeneration = 0;
	private scheduleRespawnTimer: (
		run: () => void,
		delayMs: number,
	) => ReturnType<typeof setTimeout> = (run, delayMs) =>
		setTimeout(run, delayMs);

	async start(): Promise<Connection> {
		this.desired = true;
		return this.startWithPreferredPorts();
	}

	private async startWithPreferredPorts(
		preferredPorts?: Iterable<number>,
	): Promise<Connection> {
		const generation = this.startGeneration;
		const existing = this.instance;
		if (existing?.status === "running") {
			if (existing.owned || isProcessAlive(existing.pid)) {
				return this.connectionFor(existing);
			}
			this.instance = null;
			this.emitStatus("stopped", "running");
		}

		const pending = this.pendingStart;
		if (pending) {
			if (pending.generation === generation) return pending.promise;
			try {
				await pending.promise;
			} catch {
				// Superseded starts reject during teardown.
			}
			return this.startWithPreferredPorts(preferredPorts);
		}

		const isStartAllowed = () =>
			this.desired && this.startGeneration === generation;
		const promise = this.startOrAdopt(
			preferredPorts ?? this.getPreferredPorts(),
			isStartAllowed,
		).then((connection) => {
			if (!isStartAllowed()) {
				this.stop();
				throw new Error("Host service start cancelled");
			}
			return connection;
		});
		const pendingStart = { generation, promise };
		this.pendingStart = pendingStart;
		try {
			return await promise;
		} finally {
			if (this.pendingStart === pendingStart) this.pendingStart = null;
		}
	}

	private getPreferredPorts(): number[] {
		const ports = [this.instance?.port, this.lastKnownPort, STABLE_PORT];
		const seen = new Set<number>();
		const result: number[] = [];
		for (const port of ports) {
			if (!isValidPort(port) || seen.has(port)) continue;
			seen.add(port);
			result.push(port);
		}
		return result;
	}

	private rememberPort(port: number): void {
		if (isValidPort(port)) this.lastKnownPort = port;
	}

	private getOrCreateSecret(): string {
		const secret =
			this.stableSecret ??
			readManifest()?.authToken ??
			randomBytes(32).toString("hex");
		this.stableSecret = secret;
		return secret;
	}

	stop(): void {
		this.desired = false;
		this.startGeneration++;
		this.clearRespawnState();
		const instance = this.instance;
		if (!instance) return;

		const previousStatus = instance.status;
		instance.status = "stopped";
		this.rememberPort(instance.port);
		if (instance.owned) {
			try {
				if (instance.pid > 0) killProcess(instance.pid, "SIGTERM");
			} catch {}
			this.removeManifestIfHeldBy(instance.pid);
		}
		this.instance = null;
		this.emitStatus("stopped", previousStatus);
	}

	stopAll(): void {
		this.stop();
	}

	async restart(): Promise<Connection> {
		const preferredPorts = this.getPreferredPorts();
		this.stop();
		return this.startWithPreferredPortsAfterStop(preferredPorts);
	}

	private async startWithPreferredPortsAfterStop(
		preferredPorts: Iterable<number>,
	): Promise<Connection> {
		this.desired = true;
		return this.startWithPreferredPorts(preferredPorts);
	}

	async reset(): Promise<Connection> {
		const preferredPorts = this.getPreferredPorts();
		const manifestPid = readManifest()?.pid;
		this.stop();
		if (manifestPid != null && isProcessAlive(manifestPid)) {
			try {
				killProcess(manifestPid, "SIGKILL");
			} catch (error) {
				log.warn(
					`[host-service] reset: SIGKILL of pid=${manifestPid} failed`,
					error,
				);
			}
		}
		removeManifest();
		return this.startWithPreferredPortsAfterStop(preferredPorts);
	}

	getConnection(): Connection | null {
		const instance = this.instance;
		return instance?.status === "running" ? this.connectionFor(instance) : null;
	}

	getConnections(): Connection[] {
		const connection = this.getConnection();
		return connection ? [connection] : [];
	}

	getProcessStatus(): HostServiceStatus {
		if (this.pendingStart) return "starting";
		return this.instance?.status ?? "stopped";
	}

	enableDevReload(): () => void {
		if (this.devReloadWatcher) return () => {};
		const scriptDir = path.dirname(this.scriptPath);
		const scriptFile = path.basename(this.scriptPath);
		let debounce: ReturnType<typeof setTimeout> | null = null;
		let reloading = false;

		const waitForStableBundle = async (): Promise<boolean> => {
			const deadline = Date.now() + 5_000;
			let lastSize = -1;
			let stableSince = 0;
			while (Date.now() < deadline) {
				try {
					const stat = fs.statSync(this.scriptPath);
					if (stat.size > 0 && stat.size === lastSize) {
						if (Date.now() - stableSince >= 150) return true;
					} else {
						lastSize = stat.size;
						stableSince = Date.now();
					}
				} catch {
					lastSize = -1;
					stableSince = 0;
				}
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
			return false;
		};

		const trigger = () => {
			if (debounce) clearTimeout(debounce);
			debounce = setTimeout(() => {
				void (async () => {
					if (reloading || !this.getConnection()) return;
					reloading = true;
					try {
						if (!(await waitForStableBundle())) {
							log.warn(
								"[host-service] bundle did not stabilize, skipping reload",
							);
							return;
						}
						await this.restart();
					} catch (error) {
						log.error("[host-service] dev reload failed:", error);
					} finally {
						reloading = false;
					}
				})();
			}, 250);
		};

		try {
			this.devReloadWatcher = fs.watch(scriptDir, (_event, filename) => {
				if (filename && filename !== scriptFile) return;
				trigger();
			});
		} catch (error) {
			log.error("[host-service] failed to enable dev reload:", error);
			return () => {};
		}

		return () => {
			if (debounce) clearTimeout(debounce);
			this.devReloadWatcher?.close();
			this.devReloadWatcher = null;
		};
	}

	private async startOrAdopt(
		preferredPorts: Iterable<number>,
		isStartAllowed: () => boolean,
	): Promise<Connection> {
		if (!isStartAllowed()) throw new Error("Host service start cancelled");
		const adopted = await this.tryAdopt(isStartAllowed);
		if (adopted) return adopted;

		const deadline = Date.now() + START_OR_ADOPT_DEADLINE_MS;
		for (;;) {
			if (!isStartAllowed()) throw new Error("Host service start cancelled");
			const lock = acquireSpawnLock({ staleMs: SPAWN_LOCK_STALE_MS });
			if (lock) {
				try {
					const raced = await this.tryAdopt(isStartAllowed);
					if (raced) return raced;
					return await this.spawn(preferredPorts, isStartAllowed);
				} finally {
					lock.release();
				}
			}
			const peer = await this.tryAdopt(isStartAllowed);
			if (peer) return peer;
			if (Date.now() >= deadline) {
				throw new Error("Timed out waiting to start or adopt host service");
			}
			await new Promise((resolve) =>
				setTimeout(resolve, ADOPT_WAIT_INTERVAL_MS),
			);
		}
	}

	private async tryAdopt(
		isStartAllowed: () => boolean,
	): Promise<Connection | null> {
		if (!isStartAllowed()) throw new Error("Host service start cancelled");
		const manifest = readManifest();
		if (!manifest) return null;
		let port: number;
		try {
			port = Number(new URL(manifest.endpoint).port);
		} catch {
			return null;
		}
		if (!isValidPort(port)) return null;
		if (
			!(await pollHealthCheck(
				manifest.endpoint,
				manifest.authToken,
				ADOPT_HEALTH_TIMEOUT_MS,
			))
		) {
			return null;
		}
		if (!isStartAllowed()) throw new Error("Host service start cancelled");

		const previousStatus = this.instance?.status ?? null;
		this.instance = {
			pid: manifest.pid,
			port,
			secret: manifest.authToken,
			status: "running",
			spawnedAt: manifest.startedAt,
			outputTail: "",
			redactions: [manifest.authToken],
			owned: false,
		};
		this.rememberPort(port);
		this.stableSecret = manifest.authToken;
		this.emitStatus("running", previousStatus);
		log.info(
			`[host-service] adopted existing host on port ${port} (pid ${manifest.pid})`,
		);
		return this.connectionFor(this.instance);
	}

	private async spawn(
		preferredPorts: Iterable<number> = this.getPreferredPorts(),
		isStartAllowed: () => boolean = () => true,
	): Promise<Connection> {
		if (!isStartAllowed()) throw new Error("Host service start cancelled");
		const port = await findFreePort(preferredPorts);
		if (!isStartAllowed()) throw new Error("Host service start cancelled");
		this.rememberPort(port);
		const secret = this.getOrCreateSecret();
		const browserBridgeSecret = getBrowserBridgeInfo()?.secret;
		const instance: HostServiceProcess = {
			pid: 0,
			port,
			secret,
			status: "starting",
			spawnedAt: Date.now(),
			outputTail: "",
			redactions: [secret, browserBridgeSecret].filter(
				(value): value is string => Boolean(value),
			),
			owned: true,
		};
		this.instance = instance;
		this.emitStatus("starting", null);

		const childEnv = await this.buildEnv(port, secret);
		if (!isStartAllowed()) {
			if (this.instance === instance) this.instance = null;
			throw new Error("Host service start cancelled");
		}

		const logFd = openRotatingLogFd(
			path.join(manifestDir(), "host-service.log"),
			MAX_HOST_LOG_BYTES,
		);
		const logStream =
			logFd >= 0 ? fs.createWriteStream("", { fd: logFd }) : null;
		logStream?.on("error", () => {});

		let child: ReturnType<typeof childProcess.spawn>;
		try {
			child = childProcess.spawn(process.execPath, [this.scriptPath], {
				detached: false,
				stdio: ["ignore", "pipe", "pipe"],
				env: childEnv,
				windowsHide: true,
			});
		} catch (error) {
			logStream?.end();
			throw error;
		}

		for (const source of [child.stdout, child.stderr]) {
			source?.on("error", () => {});
			source?.on("data", (chunk: Buffer) => {
				instance.outputTail =
					`${instance.outputTail}${chunk.toString("utf8")}`.slice(
						-MAX_OUTPUT_TAIL_BYTES,
					);
				logStream?.write(chunk);
			});
		}
		child.once("close", () => logStream?.end());
		if (!app.isPackaged && child.stdout && child.stderr) {
			pipeWithPrefix(child.stdout, process.stdout, "[hs]");
			pipeWithPrefix(child.stderr, process.stderr, "[hs]");
		}

		const childPid = child.pid;
		if (!childPid) {
			logStream?.end();
			this.instance = null;
			throw new Error("Failed to spawn host service process");
		}
		instance.pid = childPid;
		let childExited = false;
		child.on("exit", (code, signal) => {
			childExited = true;
			this.handleChildExit(childPid, code, signal);
		});
		child.unref();

		const endpoint = `http://127.0.0.1:${port}`;
		const healthy = await pollHealthCheck(
			endpoint,
			secret,
			HEALTH_POLL_TIMEOUT_MS,
			() => childExited || !isStartAllowed(),
		);
		if (!healthy || !isStartAllowed()) {
			if (!childExited) child.kill("SIGTERM");
			if (this.instance === instance) this.instance = null;
			this.removeManifestIfHeldBy(childPid);
			throw new Error(
				!isStartAllowed()
					? "Host service start cancelled"
					: childExited
						? "Host service process exited during startup"
						: `Host service failed to start within ${HEALTH_POLL_TIMEOUT_MS}ms`,
			);
		}

		instance.status = "running";
		log.info(`[host-service] listening on port ${port}`);
		this.emitStatus("running", "starting");
		return this.connectionFor(instance);
	}

	private async buildEnv(
		port: number,
		secret: string,
	): Promise<Record<string, string>> {
		const dir = manifestDir();
		const browserBridge = getBrowserBridgeInfo();
		const childEnv = await getProcessEnvWithShellPath({
			...(process.env as Record<string, string>),
			ELECTRON_RUN_AS_NODE: "1",
			NODE_ENV: app.isPackaged
				? "production"
				: (process.env.NODE_ENV ?? "development"),
			HOST_CLIENT_ID: getHostId(),
			HOST_NAME: getHostName(),
			HOST_SERVICE_SECRET: secret,
			HOST_SERVICE_PORT: String(port),
			HOST_MANIFEST_DIR: dir,
			HOST_DB_PATH: path.join(dir, "host.db"),
			HOST_MIGRATIONS_FOLDER: app.isPackaged
				? path.join(process.resourcesPath, "resources/host-migrations")
				: path.join(app.getAppPath(), "../../packages/host-service/drizzle"),
			CHOROS_CHAT_V3_MIGRATIONS: app.isPackaged
				? path.join(process.resourcesPath, "resources/chat-migrations")
				: path.join(
						app.getAppPath(),
						"../../packages/chat-runtime/src/db/drizzle",
					),
			...(chatV3ClaudeBin()
				? { CHOROS_CHAT_V3_CLAUDE_BIN: chatV3ClaudeBin() as string }
				: {}),
			DESKTOP_VITE_PORT: String(sharedEnv.DESKTOP_VITE_PORT),
			CHOROS_HOME_DIR,
			CHOROS_AGENT_HOOK_PORT: String(sharedEnv.DESKTOP_NOTIFICATIONS_PORT),
			CHOROS_AGENT_HOOK_VERSION: HOOK_PROTOCOL_VERSION,
			...(app.isPackaged && mainEnv.SENTRY_DSN_HOST_SERVICE
				? {
						HOST_SERVICE_SENTRY_DSN: mainEnv.SENTRY_DSN_HOST_SERVICE,
						HOST_SERVICE_SENTRY_RELEASE: app.getVersion(),
						HOST_SERVICE_SENTRY_ENVIRONMENT: "production",
					}
				: {}),
			HOST_PARENT_PID: String(process.pid),
		});

		delete childEnv.AUTH_TOKEN;
		delete childEnv.CHOROS_API_URL;
		delete childEnv.CHOROS_AUTH_CONFIG_PATH;
		delete childEnv.ORGANIZATION_ID;
		if (browserBridge) {
			childEnv.BROWSER_BRIDGE_URL = browserBridge.endpoint;
			childEnv.BROWSER_BRIDGE_SECRET = browserBridge.secret;
		} else {
			delete childEnv.BROWSER_BRIDGE_URL;
			delete childEnv.BROWSER_BRIDGE_SECRET;
		}
		return childEnv;
	}

	private connectionFor(instance: HostServiceProcess): Connection {
		return {
			port: instance.port,
			secret: instance.secret,
			machineId: this.machineId,
		};
	}

	private removeManifestIfHeldBy(pid: number): void {
		if (readManifest()?.pid === pid) removeManifest();
	}

	private emitStatus(
		status: HostServiceStatus,
		previousStatus: HostServiceStatus | null,
	): void {
		this.emit("status-changed", {
			status,
			previousStatus,
		} satisfies HostServiceStatusEvent);
	}

	private handleChildExit(
		childPid: number,
		code: number | null,
		signal: NodeJS.Signals | null,
	): void {
		log.info(`[host-service] exited with code ${code} signal ${signal}`);
		const current = this.instance;
		if (!current || current.pid !== childPid || current.status === "stopped") {
			return;
		}
		const previousStatus = current.status;
		this.rememberPort(current.port);
		this.instance = null;
		this.removeManifestIfHeldBy(childPid);
		this.emitStatus("stopped", previousStatus);
		if (previousStatus !== "running") return;

		const cause =
			signal != null ? `signal ${signal}` : `exit code ${code ?? "unknown"}`;
		log.error(`[host-service] crashed (${cause})`);
		const respawnAttempts = this.respawnState?.attempts ?? 0;
		const flushTimer = setTimeout(() => {
			void import("@sentry/electron/main")
				.then((Sentry) =>
					Sentry.captureMessage(`host-service crashed (${cause})`, {
						level: "error",
						tags: {
							exit_code: String(code ?? "none"),
							exit_signal: signal ?? "none",
						},
						extra: {
							respawnAttempts,
							pid: childPid,
							version: app.getVersion(),
							uptimeMs: Date.now() - current.spawnedAt,
							outputTail: current.redactions.reduce(
								(tail, value) => tail.split(value).join("[redacted]"),
								current.outputTail,
							),
						},
					}),
				)
				.catch(() => {});
		}, CRASH_REPORT_FLUSH_MS);
		flushTimer.unref?.();
		this.scheduleRespawn(cause);
	}

	private scheduleRespawn(cause: string): void {
		if (!this.desired) return;
		const state = this.respawnState ?? {
			attempts: 0,
			timer: null,
			stableTimer: null,
		};
		this.respawnState = state;
		const delay = nextRespawnDelayMs(state.attempts);
		if (delay === null) {
			log.error(
				`[host-service] giving up after ${state.attempts} respawn attempts`,
			);
			this.clearRespawnState();
			this.alertChildCrashed(cause);
			return;
		}
		state.attempts += 1;
		const attempt = state.attempts;
		if (state.timer) clearTimeout(state.timer);
		state.timer = this.scheduleRespawnTimer(() => {
			state.timer = null;
			void this.respawn(attempt, state);
		}, delay);
		state.timer.unref?.();
	}

	private async respawn(attempt: number, state: RespawnState): Promise<void> {
		const cancelled = () => this.respawnState !== state || !this.desired;
		try {
			await this.startWithPreferredPorts(this.getPreferredPorts());
			if (cancelled()) {
				this.stop();
				return;
			}
			log.info(`[host-service] respawned on attempt ${attempt}`);
			this.armRespawnBudgetReset();
		} catch (error) {
			if (cancelled()) return;
			log.error(`[host-service] respawn attempt ${attempt} failed:`, error);
			this.scheduleRespawn(`respawn attempt ${attempt} failed`);
		}
	}

	private armRespawnBudgetReset(): void {
		const state = this.respawnState;
		const instance = this.instance;
		if (!state || instance?.status !== "running") return;
		if (state.stableTimer) clearTimeout(state.stableTimer);
		state.stableTimer = this.scheduleRespawnTimer(() => {
			if (
				this.respawnState === state &&
				this.instance === instance &&
				instance.status === "running"
			) {
				this.clearRespawnState();
			}
		}, HOST_SERVICE_RESPAWN_STABLE_MS);
		state.stableTimer.unref?.();
	}

	private clearRespawnState(): void {
		const state = this.respawnState;
		if (!state) return;
		if (state.timer) clearTimeout(state.timer);
		if (state.stableTimer) clearTimeout(state.stableTimer);
		this.respawnState = null;
	}

	private alertChildCrashed(cause: string): void {
		void dialog.showMessageBox({
			type: "error",
			title: i18n._({
				id: "main.hostService.crashed.title",
				message: "Host service crashed",
			}),
			message: i18n._({
				id: "main.hostService.crashed.message",
				message:
					"The Choros host service stopped unexpectedly ({cause}) and could not be restarted automatically.",
				values: { cause },
			}),
			detail: i18n._({
				id: "main.hostService.crashed.detail",
				message:
					"Its workspaces and terminals are unavailable until it restarts — use the Choros tray menu > Host Service > Restart.",
			}),
		});
	}
}

function pipeWithPrefix(
	source: NodeJS.ReadableStream,
	target: NodeJS.WritableStream,
	tag: string,
): void {
	let pending = "";
	source.on("data", (chunk: Buffer) => {
		pending += chunk.toString("utf8");
		const lines = pending.split("\n");
		pending = lines.pop() ?? "";
		for (const line of lines) target.write(`${tag} ${line}\n`);
	});
	source.on("end", () => {
		if (pending) target.write(`${tag} ${pending}\n`);
	});
}

let coordinator: HostServiceCoordinator | null = null;

export function getHostServiceCoordinator(): HostServiceCoordinator {
	if (!coordinator) coordinator = new HostServiceCoordinator();
	return coordinator;
}

function chatV3ClaudeBin(): string | undefined {
	try {
		return require.resolve("@anthropic-ai/claude-agent-sdk/cli.js");
	} catch {
		return undefined;
	}
}
