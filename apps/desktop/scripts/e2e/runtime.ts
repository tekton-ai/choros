import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import { copyFile, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { probeDaemonHelloWithRetry } from "../../../../packages/host-service/src/daemon/daemon-supervisor";
import type { CdpTarget } from "../lib/cdp";

const daemonManifestSchema = z.object({ socketPath: z.string().min(1) });
const hostManifestSchema = z.object({ pid: z.number().int().min(2) });
const targetsSchema = z.array(
	z.object({
		id: z.string(),
		type: z.string(),
		url: z.string(),
		webSocketDebuggerUrl: z.string().optional(),
	}),
);

export interface DesktopE2ERuntime {
	origin: string;
	artifactDir: string;
	homeDir: string;
	desktopDir: string;
	cdpPort: number;
	targets(): Promise<CdpTarget[]>;
	newWindow(): Promise<CdpTarget>;
	restart(): Promise<CdpTarget>;
	close(): Promise<void>;
}

export async function eventually<T>(
	label: string,
	probe: () => Promise<T | null | false | undefined>,
	timeoutMs = 15_000,
): Promise<T> {
	const deadline = Date.now() + timeoutMs;
	let lastError: unknown;
	do {
		try {
			const value = await probe();
			if (value !== null && value !== undefined && value !== false)
				return value;
		} catch (error) {
			lastError = error;
		}
		await Bun.sleep(100);
	} while (Date.now() < deadline);
	throw new Error(
		`${label} timed out${lastError ? `: ${String(lastError)}` : ""}`,
	);
}

function reservePort(): ReturnType<typeof Bun.serve> {
	return Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch: () => new Response(null, { status: 503 }),
	});
}

export async function startDesktopE2E(
	options: { artifactDir?: string } = {},
): Promise<DesktopE2ERuntime> {
	const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
	const artifactDir = options.artifactDir
		? resolve(options.artifactDir)
		: await mkdtemp(join(tmpdir(), "choros-desktop-e2e-"));
	mkdirSync(artifactDir, { recursive: true });
	const appDir = join(artifactDir, "apps/desktop");
	mkdirSync(appDir, { recursive: true });
	// Keep app.getAppPath()-relative development resources and native module
	// resolution intact without overwriting the running worktree's dist/.
	await Promise.all([
		copyFile(join(desktopDir, "package.json"), join(appDir, "package.json")),
		symlink(
			join(desktopDir, "node_modules"),
			join(appDir, "node_modules"),
			"dir",
		),
		symlink(join(desktopDir, "src"), join(appDir, "src"), "dir"),
		symlink(
			resolve(desktopDir, "../../packages"),
			join(artifactDir, "packages"),
			"dir",
		),
	]);
	const homeDir = join(artifactDir, "home");
	const appHome = join(artifactDir, "state");
	const userData = join(artifactDir, "electron");
	mkdirSync(homeDir, { recursive: true });
	await Bun.write(
		join(homeDir, ".gitconfig"),
		"[user]\n\tname = Choros E2E\n\temail = e2e@example.invalid\n",
	);
	mkdirSync(appHome, { recursive: true });
	mkdirSync(join(desktopDir, ".cache"), { recursive: true });
	const lockPath = join(desktopDir, ".cache/desktop-e2e.lock");
	let lock: number | undefined;
	let app: ReturnType<typeof Bun.spawn> | undefined;
	let server: ReturnType<typeof Bun.serve> | undefined;
	const reservations: ReturnType<typeof Bun.serve>[] = [];
	let closePromise: Promise<void> | undefined;
	const commands = new Set<ReturnType<typeof Bun.spawn>>();
	const workspaceName = `desktop-e2e-${process.pid}`;
	const env: Record<string, string> = {
		PATH: process.env.PATH ?? "",
		HOME: homeDir,
		USERPROFILE: homeDir,
		SHELL: process.env.SHELL ?? "/bin/sh",
		LANG: "en_US.UTF-8",
		LC_ALL: "en_US.UTF-8",
		NODE_ENV: "development",
		SKIP_ENV_VALIDATION: "1",
		CHOROS_HOME_DIR: appHome,
		CHOROS_WORKSPACE_NAME: workspaceName,
		GIT_CONFIG_NOSYSTEM: "1",
		GIT_CONFIG_GLOBAL: join(homeDir, ".gitconfig"),
	};
	if (process.env.TMPDIR) env.TMPDIR = process.env.TMPDIR;
	if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
	const logPath = join(artifactDir, "desktop.log");

	const spawn = (args: string[], log: string, detached = false) => {
		const fd = openSync(log, "a");
		try {
			return Bun.spawn(args, {
				cwd: desktopDir,
				env,
				detached,
				stdin: "ignore",
				stdout: fd,
				stderr: fd,
			});
		} finally {
			closeSync(fd);
		}
	};
	const signalCommand = (
		child: ReturnType<typeof Bun.spawn>,
		signal: NodeJS.Signals,
	) => {
		if (child.exitCode !== null) return;
		if (process.platform === "win32") child.kill(signal);
		else {
			try {
				process.kill(-child.pid, signal);
			} catch (error) {
				if (child.exitCode === null) throw error;
			}
		}
	};
	const run = async (args: string[], log: string, timeoutMs: number) => {
		const child = spawn(args, log, true);
		commands.add(child);
		const timer = setTimeout(() => signalCommand(child, "SIGKILL"), timeoutMs);
		try {
			const code = await child.exited;
			if (code !== 0)
				throw new Error(`${args.join(" ")} exited ${code}; see ${log}`);
		} finally {
			clearTimeout(timer);
			commands.delete(child);
		}
	};

	// The daemon intentionally survives Electron. Only signal a PID whose current
	// command still matches THIS sandbox's manifest/socket; never a path-wide kill.
	const stopDaemon = async (socketPath: string | undefined) => {
		if (!socketPath) return;
		const current = await probeDaemonHelloWithRetry(socketPath, 2000, {
			perAttemptTimeoutMs: 500,
			stopWhenNoListener: true,
		});
		if (!current) return;
		const daemonPid = hostManifestSchema.shape.pid.parse(current.daemonPid);
		const ps = Bun.spawn(["ps", "-p", String(daemonPid), "-o", "command="], {
			stdout: "pipe",
			stderr: "ignore",
		});
		const command = await new Response(ps.stdout).text();
		await ps.exited;
		if (!command.trim()) return;
		if (
			!command.includes(join(appDir, "dist/main/pty-daemon.js")) ||
			!command.includes(`--socket=${socketPath}`)
		) {
			throw new Error(
				`Live sandbox PTY PID ${daemonPid} does not match its owned socket`,
			);
		}
		process.kill(daemonPid, "SIGTERM");
		await eventually(
			"sandbox PTY shutdown",
			async () => {
				try {
					process.kill(daemonPid, 0);
					return false;
				} catch {
					return true;
				}
			},
			10_000,
		);
	};
	const stopApp = async () => {
		const daemonPath = join(appHome, "host/pty-daemon-manifest.json");
		const hostPath = join(appHome, "host/manifest.json");
		const socketPath = existsSync(daemonPath)
			? daemonManifestSchema.parse(await Bun.file(daemonPath).json()).socketPath
			: undefined;
		const hostPid = existsSync(hostPath)
			? hostManifestSchema.parse(await Bun.file(hostPath).json()).pid
			: undefined;
		if (app && app.exitCode === null) {
			app.kill("SIGTERM");
			const timer = setTimeout(() => app?.kill("SIGKILL"), 12_000);
			try {
				await app.exited;
			} finally {
				clearTimeout(timer);
			}
		}
		app = undefined;
		// Stop the supervisor before its daemon, otherwise it may respawn the
		// process during shutdown. Electron's parent watchdog owns Host exit.
		if (hostPid)
			await eventually(
				"sandbox Host shutdown",
				async () => {
					try {
						process.kill(hostPid, 0);
						return false;
					} catch {
						return true;
					}
				},
				15_000,
			);
		await stopDaemon(socketPath);
	};
	const close = (): Promise<void> => {
		closePromise ??= (async () => {
			try {
				for (const command of commands) signalCommand(command, "SIGTERM");
				await Promise.all(
					[...commands].map(async (command) => {
						const timer = setTimeout(
							() => signalCommand(command, "SIGKILL"),
							5000,
						);
						try {
							await command.exited;
						} finally {
							clearTimeout(timer);
						}
					}),
				);
				await stopApp();
			} finally {
				server?.stop(true);
				for (const reservation of reservations) reservation.stop(true);
				if (lock !== undefined) {
					closeSync(lock);
					await rm(lockPath, { force: true });
				}
				process.removeListener("SIGINT", onSignal);
				process.removeListener("SIGTERM", onSignal);
			}
		})();
		return closePromise;
	};
	const onSignal = () => {
		void close().then(
			() => process.exit(130),
			(error) => {
				console.error("E2E interruption cleanup failed:", error);
				process.exit(1);
			},
		);
	};
	process.on("SIGINT", onSignal);
	process.on("SIGTERM", onSignal);

	try {
		lock = openSync(lockPath, "wx");
		const rendererReservation = reservePort();
		const cdpReservation = reservePort();
		const notificationReservation = reservePort();
		reservations.push(
			rendererReservation,
			cdpReservation,
			notificationReservation,
		);
		const rendererPort = z
			.number()
			.int()
			.positive()
			.parse(rendererReservation.port);
		const cdpPort = z.number().int().positive().parse(cdpReservation.port);
		const origin = `http://localhost:${rendererPort}`;
		env.DESKTOP_E2E_RENDERER_PORT = String(rendererPort);
		env.DESKTOP_E2E_NOTIFICATIONS_PORT = String(notificationReservation.port);
		env.DESKTOP_E2E_WORKSPACE_NAME = workspaceName;
		env.DESKTOP_E2E_APP_DIR = appDir;
		env.RENDERER_REMOTE_DEBUG_PORT = String(cdpPort);
		console.log(`E2E artifacts: ${artifactDir}`);
		await Bun.write(
			join(artifactDir, "isolation.json"),
			JSON.stringify(
				{
					desktopDir,
					appDir,
					homeDir,
					appHome,
					userData,
					origin,
					cdpPort,
					workspaceName,
				},
				null,
				2,
			),
		);
		if (
			!existsSync(
				join(desktopDir, "src/resources/public/file-icons/manifest.json"),
			)
		) {
			await run(
				[process.execPath, "run", "scripts/generate-file-icons.ts"],
				join(artifactDir, "build.log"),
				60_000,
			);
		}
		await run(
			[
				process.execPath,
				"x",
				"electron-vite",
				"build",
				"--config",
				"scripts/e2e/electron.vite.config.ts",
			],
			join(artifactDir, "build.log"),
			300_000,
		);
		const rendererRoot = join(appDir, "dist/renderer");
		rendererReservation.stop(true);
		server = Bun.serve({
			hostname: "localhost",
			port: rendererPort,
			async fetch(request) {
				const pathname = decodeURIComponent(new URL(request.url).pathname);
				// Authentication is outside this local-product suite. Use the app's
				// existing dev bypass with an unauthenticated bootstrap, no credentials.
				if (pathname === "/api/auth/get-session") return Response.json(null);
				const filePath = resolve(
					rendererRoot,
					`.${pathname === "/" ? "/index.html" : pathname}`,
				);
				if (!filePath.startsWith(`${rendererRoot}${sep}`))
					return new Response(null, { status: 403 });
				const file = Bun.file(filePath);
				return (await file.exists())
					? new Response(file)
					: new Response(null, { status: 404 });
			},
		});
		const electronModule = await import("electron");
		// Outside Electron, its Node package exports the executable path.
		const executable = electronModule.default as unknown as string;
		const args = [
			executable,
			appDir,
			`--user-data-dir=${userData}`,
			`--remote-debugging-port=${cdpPort}`,
			"--lang=en-US",
		];
		const targets = async () => {
			const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`, {
				signal: AbortSignal.timeout(2000),
			});
			const all = targetsSchema.parse(await response.json());
			return all.filter(
				(target) =>
					target.type === "page" &&
					target.webSocketDebuggerUrl &&
					target.url.startsWith(`${origin}/`),
			);
		};
		const launch = async () => {
			app = spawn(args, logPath);
			return eventually(
				"isolated Electron renderer",
				async () => {
					if (app?.exitCode !== null)
						throw new Error(`Electron exited; see ${logPath}`);
					return (await targets())[0];
				},
				45_000,
			);
		};
		cdpReservation.stop(true);
		notificationReservation.stop(true);
		await launch();
		return {
			origin,
			artifactDir,
			homeDir,
			desktopDir,
			cdpPort,
			targets,
			async newWindow() {
				const before = new Set((await targets()).map((target) => target.id));
				await run([...args, "--new-window"], logPath, 15_000);
				return eventually(
					"second Electron window",
					async () =>
						(await targets()).find((target) => !before.has(target.id)),
					30_000,
				);
			},
			async restart() {
				await stopApp();
				return launch();
			},
			close,
		};
	} catch (error) {
		await close();
		throw error;
	}
}
