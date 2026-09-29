import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { runManagedScript } from "../src/runtime/setup/managed-script.ts";

if (process.platform !== "win32")
	throw new Error("This smoke verification must run on a real Windows host");

const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
if (!systemRoot) throw new Error("SystemRoot is unavailable");
const powerShell = join(
	systemRoot,
	"System32",
	"WindowsPowerShell",
	"v1.0",
	"powershell.exe",
);
const environment: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env))
	if (value !== undefined) environment[key] = value;

async function waitForFile(path: string, timeoutMilliseconds = 10_000) {
	const deadline = Date.now() + timeoutMilliseconds;
	while (Date.now() < deadline) {
		try {
			if ((await stat(path)).size > 0) return;
		} catch {}
		await delay(25);
	}
	throw new Error(`Timed out waiting for ${path}`);
}

async function assertNoMoreWrites(path: string) {
	const before = (await stat(path)).size;
	await delay(750);
	assert.equal(
		(await stat(path)).size,
		before,
		`process continued writing after managed-script reported quiescence: ${path}`,
	);
}

async function writeBackgroundLauncher(options: {
	directory: string;
	name: string;
	scriptPath: string;
	outputPath: string;
	exitCode: number;
}) {
	const launcherPath = join(options.directory, `${options.name}.cmd`);
	await writeFile(
		launcherPath,
		[
			"@echo off",
			`start "" /b "${powerShell}" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${options.scriptPath}" "${options.outputPath}" >nul 2>&1`,
			`exit /b ${options.exitCode}`,
			"",
		].join("\r\n"),
		"utf8",
	);
	return launcherPath;
}

const directory = await mkdtemp(join(tmpdir(), "choros-windows-job-smoke-"));
try {
	const completionScript = join(directory, "complete-child.ps1");
	const completionOutput = join(directory, "complete-child.txt");
	await writeFile(
		completionScript,
		[
			"param([string]$Path)",
			'[System.IO.File]::AppendAllText($Path, "started`n")',
			"Start-Sleep -Milliseconds 1200",
			'[System.IO.File]::AppendAllText($Path, "finished`n")',
		].join("\r\n"),
		"utf8",
	);
	const completionLauncher = await writeBackgroundLauncher({
		directory,
		name: "complete-parent",
		scriptPath: completionScript,
		outputPath: completionOutput,
		exitCode: 23,
	});
	const completed = await runManagedScript({
		command: `call "${completionLauncher}"`,
		cwd: directory,
		env: environment,
		timeoutSeconds: 15,
		signal: new AbortController().signal,
	});
	assert.equal(
		completed.exitCode,
		23,
		"the parent cmd exit code was not preserved",
	);
	assert.equal(completed.quiescent, true);
	assert.equal(completed.timedOut, false);
	assert.equal(completed.cancelled, false);
	assert.match(
		await readFile(completionOutput, "utf8"),
		/started\r?\nfinished\r?\n/,
		"managed-script returned before the background child finished",
	);

	const envToken = `managed-script-env-${Date.now()}`;
	const normal = await runManagedScript({
		command:
			"echo %CHOROS_MANAGED_SCRIPT_SMOKE% & echo managed-script-stderr 1>&2 & cd",
		cwd: directory,
		env: { ...environment, CHOROS_MANAGED_SCRIPT_SMOKE: envToken },
		timeoutSeconds: 15,
		signal: new AbortController().signal,
	});
	assert.equal(normal.exitCode, 0);
	assert.equal(normal.quiescent, true);
	assert.match(normal.output, new RegExp(envToken));
	assert.match(normal.output, /managed-script-stderr/);
	assert.match(
		normal.output.toLowerCase(),
		new RegExp(directory.toLowerCase().replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")),
	);

	const bounded = await runManagedScript({
		command: "for /L %i in (1,1,7000) do @echo 0123456789",
		cwd: directory,
		env: environment,
		timeoutSeconds: 15,
		signal: new AbortController().signal,
	});
	assert.equal(bounded.exitCode, 0);
	assert.equal(bounded.quiescent, true);
	assert.equal(bounded.truncated, true);
	assert.ok(Buffer.byteLength(bounded.output, "utf8") <= 65_536);

	const writerScript = join(directory, "writer-child.ps1");
	await writeFile(
		writerScript,
		[
			"param([string]$Path)",
			"while ($true) {",
			'    [System.IO.File]::AppendAllText($Path, "tick`n")',
			"    Start-Sleep -Milliseconds 50",
			"}",
		].join("\r\n"),
		"utf8",
	);

	const cancelledOutput = join(directory, "cancelled-writer.txt");
	const cancelledLauncher = await writeBackgroundLauncher({
		directory,
		name: "cancelled-parent",
		scriptPath: writerScript,
		outputPath: cancelledOutput,
		exitCode: 0,
	});
	const abortController = new AbortController();
	const cancellation = runManagedScript({
		command: `call "${cancelledLauncher}"`,
		cwd: directory,
		env: environment,
		timeoutSeconds: 30,
		signal: abortController.signal,
	});
	await waitForFile(cancelledOutput);
	abortController.abort();
	const cancelled = await cancellation;
	assert.equal(cancelled.cancelled, true);
	assert.equal(cancelled.timedOut, false);
	assert.equal(cancelled.quiescent, true);
	await assertNoMoreWrites(cancelledOutput);

	const timedOutOutput = join(directory, "timed-out-writer.txt");
	const timedOutLauncher = await writeBackgroundLauncher({
		directory,
		name: "timed-out-parent",
		scriptPath: writerScript,
		outputPath: timedOutOutput,
		exitCode: 0,
	});
	const timedOut = await runManagedScript({
		command: `call "${timedOutLauncher}"`,
		cwd: directory,
		env: environment,
		timeoutSeconds: 8,
		signal: new AbortController().signal,
	});
	assert.equal(timedOut.timedOut, true);
	assert.equal(timedOut.cancelled, false);
	assert.equal(timedOut.quiescent, true);
	await waitForFile(timedOutOutput);
	await assertNoMoreWrites(timedOutOutput);

	console.log("Windows managed-script Job Object smoke verification passed");
} finally {
	await rm(directory, { recursive: true, force: true });
}
