import { spawn } from "node:child_process";

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
	const windows = process.platform === "win32";
	const child = spawn(
		windows ? (process.env.ComSpec ?? "cmd.exe") : "/bin/sh",
		windows ? ["/d", "/s", "/c", options.command] : ["-c", options.command],
		{
			cwd: options.cwd,
			env: options.env,
			detached: !windows,
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
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
		if (!child.pid) return;
		try {
			if (windows) {
				if (!closed) child.kill(signal);
			} else process.kill(-child.pid, signal);
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
		if (!windows && child.pid) {
			const groupAlive = () => {
				try {
					process.kill(-child.pid!, 0);
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
		} else if (windows && (cancelled || timedOut)) {
			// A child exit alone cannot prove a Windows process subtree has stopped.
			quiescent = false;
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
