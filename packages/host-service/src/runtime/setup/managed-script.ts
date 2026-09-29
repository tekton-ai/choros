import { spawn } from "node:child_process";
import { runWindowsManagedScript } from "./windows-job-supervisor.ts";

export interface ManagedScriptResult {
	exitCode: number | null;
	output: string;
	truncated: boolean;
	timedOut: boolean;
	cancelled: boolean;
	quiescent: boolean;
}

/** Owns one process group for the lifetime of a single setup/precheck operation. */
export async function runManagedScript(options: {
	command: string;
	cwd: string;
	env: Record<string, string>;
	timeoutSeconds: number;
	signal: AbortSignal;
}): Promise<ManagedScriptResult> {
	if (options.signal.aborted)
		return {
			exitCode: null,
			output: "",
			truncated: false,
			timedOut: false,
			cancelled: true,
			quiescent: true,
		};
	if (process.platform === "win32") return runWindowsManagedScript(options);
	const child = spawn("/bin/sh", ["-c", options.command], {
		cwd: options.cwd,
		env: options.env,
		detached: true,
		stdio: ["ignore", "pipe", "pipe"],
	});
	const childPid = child.pid;
	const chunks: Buffer[] = [];
	let captured = 0;
	let truncated = false;
	let timedOut = false;
	let cancelled = false;
	let closed = false;
	let escalator: ReturnType<typeof setTimeout> | undefined;
	const capture = (data: Buffer) => {
		const remaining = 65536 - captured;
		if (data.length > remaining) truncated = true;
		if (remaining > 0) {
			const part = data.subarray(0, remaining);
			chunks.push(part);
			captured += part.length;
		}
	};
	child.stdout.on("data", capture);
	child.stderr.on("data", capture);
	const signalOwned = (signal: NodeJS.Signals) => {
		if (!childPid) return;
		try {
			process.kill(-childPid, signal);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
		}
	};
	const stop = () => {
		try {
			signalOwned("SIGTERM");
		} catch {
			/* Quiescence is checked below, never assumed. */
		}
		if (!escalator)
			escalator = setTimeout(() => {
				try {
					signalOwned("SIGKILL");
				} catch {
					/* Report unknown if stop cannot be confirmed. */
				}
			}, 1000);
	};
	const onAbort = () => {
		cancelled = true;
		stop();
	};
	options.signal.addEventListener("abort", onAbort, { once: true });
	const deadline = setTimeout(() => {
		timedOut = true;
		stop();
	}, options.timeoutSeconds * 1000);
	try {
		const exitCode = await new Promise<number | null>((resolve, reject) => {
			child.once("error", reject);
			child.once("close", (code) => {
				closed = true;
				resolve(code);
			});
		});
		let quiescent = closed;
		if (childPid) {
			const groupAlive = () => {
				try {
					process.kill(-childPid, 0);
					return true;
				} catch (error) {
					return (error as NodeJS.ErrnoException).code !== "ESRCH";
				}
			};
			if (groupAlive()) {
				stop();
				const until = performance.now() + 2000;
				while (groupAlive() && performance.now() < until)
					await new Promise((resolve) => setTimeout(resolve, 25));
				quiescent = !groupAlive();
			}
		}
		return {
			exitCode,
			output: Buffer.concat(chunks).toString("utf8"),
			truncated,
			timedOut,
			cancelled,
			quiescent,
		};
	} finally {
		clearTimeout(deadline);
		clearTimeout(escalator);
		options.signal.removeEventListener("abort", onAbort);
	}
}
