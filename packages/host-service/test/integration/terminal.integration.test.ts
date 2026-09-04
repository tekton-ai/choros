import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type ChildProcess, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@choros/pty-daemon";
import { TRPCClientError } from "@trpc/client";
import { disposeDaemonClient } from "../../src/terminal/daemon-client-singleton";
import {
	initTerminalBaseEnv,
	resetTerminalBaseEnvForTests,
} from "../../src/terminal/env";
import { listTerminalResourceSessions } from "../../src/terminal/resource-sessions";
import { __resetSessionsForTesting } from "../../src/terminal/terminal";
import { __setAccountShellForTesting } from "../../src/terminal/user-shell.ts";
import { type BasicScenario, createBasicScenario } from "../helpers/scenarios";
import { seedTerminalSession } from "../helpers/seed";

describe("terminal router integration", () => {
	let scenario: BasicScenario;

	beforeEach(async () => {
		initTerminalBaseEnv({
			PATH: process.env.PATH ?? "/usr/bin:/bin",
			HOME: process.env.HOME ?? tmpdir(),
			SHELL: "/bin/sh",
		});
		scenario = await createBasicScenario();
	});

	afterEach(async () => {
		__resetSessionsForTesting();
		await disposeDaemonClient();
		resetTerminalBaseEnvForTests();
		__setAccountShellForTesting(undefined);
		// Dispose BEFORE dropping the isolation env: cleanup paths resolve
		// daemon manifests/sockets, and without CHOROS_HOME_DIR they would
		// hit the real ~/.choros namespace (the manifest layer now throws
		// on that in tests).
		await scenario?.dispose();
		delete process.env.CHOROS_PTY_DAEMON_SOCKET;
		delete process.env.CHOROS_HOME_DIR;
	});

	test("list returns empty when no sessions exist", async () => {
		const result = await scenario.host.trpc.terminal.list.query({
			workspaceId: scenario.workspaceId,
		});
		expect(result.sessions).toEqual([]);
	});

	test("killSession throws NOT_FOUND for unknown workspace", async () => {
		await expect(
			scenario.host.trpc.terminal.killSession.mutate({
				workspaceId: "no-such-ws",
				terminalId: randomUUID(),
			}),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("killSession throws NOT_FOUND for unknown terminal", async () => {
		await expect(
			scenario.host.trpc.terminal.killSession.mutate({
				workspaceId: scenario.workspaceId,
				terminalId: randomUUID(),
			}),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("list requires authentication", async () => {
		await expect(
			scenario.host.unauthenticatedTrpc.terminal.list.query({
				workspaceId: scenario.workspaceId,
			}),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("createSession sends the configured shell to the daemon instead of inherited bash", async () => {
		const tmp = mkdtempSync(join(tmpdir(), "host-service-terminal-shell-"));
		const socketPath = join(tmp, "pty-daemon.sock");
		const fakeFishPath = join(tmp, "fish");
		const terminalId = randomUUID();
		const spawned: Array<{
			meta: {
				shell: string;
				argv: string[];
				env?: Record<string, string>;
			};
		}> = [];
		const server = new Server({
			socketPath,
			daemonVersion: "0.0.0-terminal-shell-test",
			spawnPty: ({ meta }) => {
				spawned.push({ meta });
				return createFakePty(4200 + spawned.length, meta);
			},
		});

		writeFileSync(fakeFishPath, "#!/bin/sh\n", { mode: 0o755 });

		try {
			await server.listen();
			process.env.CHOROS_PTY_DAEMON_SOCKET = socketPath;
			process.env.CHOROS_HOME_DIR = tmp;
			__setAccountShellForTesting(fakeFishPath);
			resetTerminalBaseEnvForTests();
			initTerminalBaseEnv({
				PATH: `${tmp}:${process.env.PATH ?? "/usr/bin:/bin"}`,
				HOME: process.env.HOME ?? tmp,
				SHELL: "/bin/bash",
			});

			await scenario.host.trpc.terminal.createSession.mutate({
				workspaceId: scenario.workspaceId,
				terminalId,
			});
			const listed = await scenario.host.trpc.terminal.list.query({
				workspaceId: scenario.workspaceId,
			});

			expect(spawned).toHaveLength(1);
			expect(listed.sessions.map((session) => session.terminalId)).toEqual([
				terminalId,
			]);
			const [{ meta }] = spawned;
			expect(meta.shell).toBe(fakeFishPath);
			expect(meta.argv[0]).toBe("-l");
			expect(meta.argv[1]).toBe("--init-command");
			expect(meta.env?.SHELL).toBe(fakeFishPath);
			expect(meta.env?.CHOROS_TERMINAL_ID).toBe(terminalId);
		} finally {
			await scenario.host.trpc.terminal.killSession
				.mutate({
					workspaceId: scenario.workspaceId,
					terminalId,
				})
				.catch(() => {});
			await disposeDaemonClient();
			await server.close();
			rmSync(tmp, { recursive: true, force: true });
		}
	});

	test("resource sessions are daemon-sourced and joined to active DB rows", () => {
		const activeTerminalId = randomUUID();
		const disposedTerminalId = randomUUID();
		const exitedTerminalId = randomUUID();
		const orphanTerminalId = randomUUID();
		const fractionalPidTerminalId = randomUUID();
		const unknownTerminalId = randomUUID();
		seedTerminalSession(scenario.host, {
			id: activeTerminalId,
			originWorkspaceId: scenario.workspaceId,
		});
		seedTerminalSession(scenario.host, {
			id: disposedTerminalId,
			originWorkspaceId: scenario.workspaceId,
			status: "disposed",
		});
		seedTerminalSession(scenario.host, {
			id: exitedTerminalId,
			originWorkspaceId: scenario.workspaceId,
			status: "exited",
		});
		seedTerminalSession(scenario.host, {
			id: orphanTerminalId,
			originWorkspaceId: null,
		});
		seedTerminalSession(scenario.host, {
			id: fractionalPidTerminalId,
			originWorkspaceId: scenario.workspaceId,
		});

		const sessions = listTerminalResourceSessions(
			scenario.host.db,
			[
				{
					id: activeTerminalId,
					pid: 123,
					cols: 80,
					rows: 24,
					alive: true,
				},
				{
					id: disposedTerminalId,
					pid: 124,
					cols: 80,
					rows: 24,
					alive: true,
				},
				{
					id: exitedTerminalId,
					pid: 125,
					cols: 80,
					rows: 24,
					alive: true,
				},
				{
					id: orphanTerminalId,
					pid: 126,
					cols: 80,
					rows: 24,
					alive: true,
				},
				{
					id: unknownTerminalId,
					pid: 127,
					cols: 80,
					rows: 24,
					alive: true,
				},
				{
					id: fractionalPidTerminalId,
					pid: 128.5,
					cols: 80,
					rows: 24,
					alive: true,
				},
				{
					id: activeTerminalId,
					pid: 129,
					cols: 80,
					rows: 24,
					alive: false,
				},
			],
			new Map([[activeTerminalId, "Claude Code"]]),
		);

		expect(sessions).toEqual([
			{
				terminalId: activeTerminalId,
				workspaceId: scenario.workspaceId,
				pid: 123,
				title: "Claude Code",
			},
		]);
	});
});

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function _detachedHelperScript(pidPath: string): string {
	return [
		"set -m",
		`${shellQuote(process.execPath)} -e ${shellQuote("process.on('SIGHUP', () => {}); process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);")} >/dev/null 2>&1 & helper_pid=$!`,
		`echo "$helper_pid" > ${shellQuote(pidPath)}`,
		"sleep 60",
	].join("; ");
}

function createFakePty(
	pid: number,
	meta: {
		shell: string;
		argv: string[];
		cwd?: string;
		env?: Record<string, string>;
		cols: number;
		rows: number;
	},
) {
	let currentMeta = meta;
	const exitCallbacks: Array<
		(info: { code: number | null; signal: number | null }) => void
	> = [];

	return {
		pid,
		get meta() {
			return currentMeta;
		},
		write() {},
		resize(cols: number, rows: number) {
			currentMeta = { ...currentMeta, cols, rows };
		},
		kill() {
			for (const callback of exitCallbacks.splice(0)) {
				callback({ code: null, signal: null });
			}
		},
		onData() {},
		onExit(
			callback: (info: { code: number | null; signal: number | null }) => void,
		) {
			exitCallbacks.push(callback);
		},
		getMasterFd() {
			return 0;
		},
	};
}

function _ensureDaemonBundle(bundlePath: string): void {
	const packageDir = fileURLToPath(
		new URL("../../../pty-daemon", import.meta.url),
	);
	const result = spawnSync("bun", ["run", "build:daemon"], {
		cwd: packageDir,
		encoding: "utf8",
	});
	if (result.status === 0) {
		if (!existsSync(bundlePath)) {
			throw new Error(`pty-daemon bundle was not created: ${bundlePath}`);
		}
		return;
	}
	throw new Error(
		[
			"failed to build pty-daemon bundle for integration test",
			`exitCode: ${result.status}`,
			`stdout:\n${result.stdout}`,
			`stderr:\n${result.stderr}`,
		].join("\n"),
	);
}

function _readPositivePidFile(filePath: string): number | null {
	if (!existsSync(filePath)) return null;
	const raw = readFileSync(filePath, "utf8").trim();
	if (!/^\d+$/.test(raw)) return null;
	const pid = Number(raw);
	return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function _isPidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

async function _waitFor(
	predicate: () => boolean,
	timeoutMs: number,
	message?: () => string,
): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error(message?.() ?? `condition timed out after ${timeoutMs}ms`);
}

async function _stopDaemonProcess(child: ChildProcess | null): Promise<void> {
	if (!child || child.exitCode !== null || child.signalCode !== null) return;
	child.kill("SIGTERM");
	if (await waitForProcessExit(child, 1000)) return;
	child.kill("SIGKILL");
	await waitForProcessExit(child, 1000);
}

async function waitForProcessExit(
	child: ChildProcess,
	timeoutMs: number,
): Promise<boolean> {
	if (child.exitCode !== null || child.signalCode !== null) return true;
	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			cleanup();
			resolve(false);
		}, timeoutMs);
		const onExit = () => {
			cleanup();
			resolve(true);
		};
		const cleanup = () => {
			clearTimeout(timeout);
			child.off("exit", onExit);
		};
		child.once("exit", onExit);
	});
}
