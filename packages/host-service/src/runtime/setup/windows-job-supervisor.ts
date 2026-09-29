import { type ChildProcessByStdio, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import type { ManagedScriptResult } from "./managed-script.ts";

const MAX_OUTPUT_BYTES = 65_536;
const SUPERVISOR_STOP_GRACE_MS = 5_000;

interface WindowsSupervisorReceipt {
	version: 1;
	nonce: string;
	status: "completed" | "failed";
	exitCode: number | null;
	quiescent: boolean;
	userProcessStarted: boolean;
	message?: string;
}

const WINDOWS_JOB_SUPERVISOR = String.raw`
param(
    [Parameter(Mandatory = $true)][string]$RequestPath,
    [Parameter(Mandatory = $true)][string]$ReceiptPath,
    [Parameter(Mandatory = $true)][string]$CancellationPath
)

$ErrorActionPreference = "Stop"
$receiptNonce = $env:CHOROS_MANAGED_SCRIPT_RECEIPT_NONCE
if ([string]::IsNullOrEmpty($receiptNonce)) {
    throw "Managed-script receipt nonce is unavailable"
}
[System.Environment]::SetEnvironmentVariable("CHOROS_MANAGED_SCRIPT_RECEIPT_NONCE", $null, "Process")
$runInvoked = $false

function Write-Receipt([object]$Receipt) {
    $temporaryPath = "$ReceiptPath.tmp"
    $json = $Receipt | ConvertTo-Json -Compress
    [System.IO.File]::WriteAllText(
        $temporaryPath,
        $json,
        [System.Text.UTF8Encoding]::new($false)
    )
    [System.IO.File]::Move($temporaryPath, $ReceiptPath)
}

try {
    $source = @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class ChorosWindowsJobSupervisor
{
    private const uint CREATE_SUSPENDED = 0x00000004;
    private const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;
    private const uint STARTF_USESTDHANDLES = 0x00000100;
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
    private const int JobObjectBasicAccountingInformation = 1;
    private const int JobObjectExtendedLimitInformation = 9;
    private const uint WAIT_OBJECT_0 = 0;
    private const uint WAIT_TIMEOUT = 258;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct STARTUPINFO
    {
        public uint cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public uint dwX;
        public uint dwY;
        public uint dwXSize;
        public uint dwYSize;
        public uint dwXCountChars;
        public uint dwYCountChars;
        public uint dwFillAttribute;
        public uint dwFlags;
        public ushort wShowWindow;
        public ushort cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_INFORMATION
    {
        public IntPtr hProcess;
        public IntPtr hThread;
        public uint dwProcessId;
        public uint dwThreadId;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IO_COUNTERS
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_ACCOUNTING_INFORMATION
    {
        public long TotalUserTime;
        public long TotalKernelTime;
        public long ThisPeriodTotalUserTime;
        public long ThisPeriodTotalKernelTime;
        public uint TotalPageFaultCount;
        public uint TotalProcesses;
        public uint ActiveProcesses;
        public uint TotalTerminatedProcesses;
    }

    public sealed class RunResult
    {
        public string Status { get; set; }
        public long? ExitCode { get; set; }
        public bool Quiescent { get; set; }
        public bool UserProcessStarted { get; set; }
        public string Message { get; set; }
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr jobAttributes, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(
        IntPtr job,
        int informationClass,
        ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION information,
        uint informationLength
    );

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool QueryInformationJobObject(
        IntPtr job,
        int informationClass,
        out JOBOBJECT_BASIC_ACCOUNTING_INFORMATION information,
        uint informationLength,
        IntPtr returnLength
    );

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcess(
        string applicationName,
        StringBuilder commandLine,
        IntPtr processAttributes,
        IntPtr threadAttributes,
        bool inheritHandles,
        uint creationFlags,
        IntPtr environment,
        string currentDirectory,
        ref STARTUPINFO startupInfo,
        out PROCESS_INFORMATION processInformation
    );

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(IntPtr thread);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateJobObject(IntPtr job, uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(IntPtr process, uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr GetStdHandle(int standardHandle);

    private static Win32Exception LastError(string operation)
    {
        return new Win32Exception(Marshal.GetLastWin32Error(), operation + " failed");
    }

    private static IntPtr BuildEnvironment(string[] entries)
    {
        Array.Sort(entries, StringComparer.OrdinalIgnoreCase);
        var block = new StringBuilder();
        string previousName = null;
        foreach (var entry in entries)
        {
            var separator = entry.IndexOf('=');
            var name = separator < 0 ? entry : entry.Substring(0, separator);
            if (previousName != null && StringComparer.OrdinalIgnoreCase.Equals(previousName, name))
                continue;
            block.Append(entry);
            block.Append('\0');
            previousName = name;
        }
        block.Append('\0');
        return Marshal.StringToHGlobalUni(block.ToString());
    }

    private static uint ActiveProcesses(IntPtr job)
    {
        JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting;
        if (!QueryInformationJobObject(
            job,
            JobObjectBasicAccountingInformation,
            out accounting,
            (uint)Marshal.SizeOf(typeof(JOBOBJECT_BASIC_ACCOUNTING_INFORMATION)),
            IntPtr.Zero
        ))
            throw LastError("QueryInformationJobObject");
        return accounting.ActiveProcesses;
    }

    private static bool WaitForQuiescence(IntPtr job, int timeoutMilliseconds)
    {
        var deadline = DateTime.UtcNow.AddMilliseconds(timeoutMilliseconds);
        do
        {
            if (ActiveProcesses(job) == 0)
                return true;
            Thread.Sleep(25);
        }
        while (DateTime.UtcNow < deadline);
        return ActiveProcesses(job) == 0;
    }

    public static RunResult Run(
        string shellPath,
        string command,
        string workingDirectory,
        string[] environment,
        string cancellationPath
    )
    {
        IntPtr job = IntPtr.Zero;
        IntPtr environmentBlock = IntPtr.Zero;
        var processInformation = new PROCESS_INFORMATION();
        var userProcessStarted = false;
        var processAssigned = false;
        try
        {
            job = CreateJobObject(IntPtr.Zero, null);
            if (job == IntPtr.Zero)
                throw LastError("CreateJobObject");

            var limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if (!SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                ref limits,
                (uint)Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION))
            ))
                throw LastError("SetInformationJobObject");

            environmentBlock = BuildEnvironment(environment);
            var startupInfo = new STARTUPINFO();
            startupInfo.cb = (uint)Marshal.SizeOf(typeof(STARTUPINFO));
            startupInfo.dwFlags = STARTF_USESTDHANDLES;
            startupInfo.hStdInput = GetStdHandle(-10);
            startupInfo.hStdOutput = GetStdHandle(-11);
            startupInfo.hStdError = GetStdHandle(-12);
            var commandLine = new StringBuilder(
                "\"" + shellPath + "\" /d /s /c \"" + command + "\""
            );

            if (!CreateProcess(
                shellPath,
                commandLine,
                IntPtr.Zero,
                IntPtr.Zero,
                true,
                CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT,
                environmentBlock,
                workingDirectory,
                ref startupInfo,
                out processInformation
            ))
                throw LastError("CreateProcess");

            if (!AssignProcessToJobObject(job, processInformation.hProcess))
                throw LastError("AssignProcessToJobObject");
            processAssigned = true;

            if (File.Exists(cancellationPath))
            {
                if (!TerminateJobObject(job, 1))
                    throw LastError("TerminateJobObject");
                return new RunResult {
                    Status = "completed",
                    ExitCode = null,
                    Quiescent = WaitForQuiescence(job, 5000),
                    UserProcessStarted = false
                };
            }

            if (ResumeThread(processInformation.hThread) == UInt32.MaxValue)
                throw LastError("ResumeThread");
            userProcessStarted = true;

            var terminationRequested = false;
            uint parentExitCode = 0;
            var parentExited = false;
            while (true)
            {
                var wait = WaitForSingleObject(processInformation.hProcess, 25);
                if (wait == WAIT_OBJECT_0 && !parentExited)
                {
                    if (!GetExitCodeProcess(processInformation.hProcess, out parentExitCode))
                        throw LastError("GetExitCodeProcess");
                    parentExited = true;
                }
                else if (wait != WAIT_OBJECT_0 && wait != WAIT_TIMEOUT)
                    throw LastError("WaitForSingleObject");

                if (!terminationRequested && File.Exists(cancellationPath))
                {
                    if (!TerminateJobObject(job, 1))
                        throw LastError("TerminateJobObject");
                    terminationRequested = true;
                }

                if (parentExited && ActiveProcesses(job) == 0)
                    return new RunResult {
                        Status = "completed",
                        ExitCode = parentExitCode,
                        Quiescent = true,
                        UserProcessStarted = true
                    };
                if (parentExited)
                    Thread.Sleep(25);
            }
        }
        catch (Exception error)
        {
            var quiescent = !userProcessStarted;
            try
            {
                if (job != IntPtr.Zero && processAssigned)
                {
                    TerminateJobObject(job, 1);
                    quiescent = WaitForQuiescence(job, 5000);
                }
                else if (processInformation.hProcess != IntPtr.Zero)
                {
                    TerminateProcess(processInformation.hProcess, 1);
                    quiescent = WaitForSingleObject(processInformation.hProcess, 5000) == WAIT_OBJECT_0;
                }
            }
            catch
            {
                quiescent = false;
            }
            return new RunResult {
                Status = "failed",
                ExitCode = null,
                Quiescent = quiescent,
                UserProcessStarted = userProcessStarted,
                Message = error.Message
            };
        }
        finally
        {
            if (processInformation.hThread != IntPtr.Zero)
                CloseHandle(processInformation.hThread);
            if (processInformation.hProcess != IntPtr.Zero)
                CloseHandle(processInformation.hProcess);
            if (environmentBlock != IntPtr.Zero)
                Marshal.FreeHGlobal(environmentBlock);
            if (job != IntPtr.Zero)
                CloseHandle(job);
        }
    }
}
'@

    Add-Type -TypeDefinition $source -Language CSharp
    $request = Get-Content -LiteralPath $RequestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $environment = @(
        [System.Environment]::GetEnvironmentVariables().GetEnumerator() | ForEach-Object {
            "$($_.Key)=$($_.Value)"
        }
    )
    $runInvoked = $true
    $result = [ChorosWindowsJobSupervisor]::Run(
        [string]$request.shellPath,
        [string]$request.command,
        [string]$request.cwd,
        [string[]]$environment,
        $CancellationPath
    )
    Write-Receipt @{
        version = 1
        nonce = $receiptNonce
        status = $result.Status
        exitCode = $result.ExitCode
        quiescent = $result.Quiescent
        userProcessStarted = $result.UserProcessStarted
        message = $result.Message
    }
    if ($result.Status -eq "completed") { exit 0 }
    exit 253
}
catch {
    try {
        Write-Receipt @{
            version = 1
            status = "failed"
            nonce = $receiptNonce
            exitCode = $null
            quiescent = -not $runInvoked
            userProcessStarted = $runInvoked
            message = $_.Exception.Message
        }
    }
    catch {}
    exit 254
}
`;

function windowsSystemPaths(): { powerShell: string; commandShell: string } {
	const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
	if (!systemRoot)
		throw new Error(
			"Windows managed-script supervisor cannot locate SystemRoot",
		);
	return {
		powerShell: join(
			systemRoot,
			"System32",
			"WindowsPowerShell",
			"v1.0",
			"powershell.exe",
		),
		commandShell: join(systemRoot, "System32", "cmd.exe"),
	};
}

function parseReceipt(
	raw: string,
	expectedNonce: string,
): WindowsSupervisorReceipt {
	const value = JSON.parse(
		raw.replace(/^\uFEFF/, ""),
	) as Partial<WindowsSupervisorReceipt>;
	if (
		value.version !== 1 ||
		value.nonce !== expectedNonce ||
		(value.status !== "completed" && value.status !== "failed") ||
		typeof value.quiescent !== "boolean" ||
		typeof value.userProcessStarted !== "boolean" ||
		(value.exitCode !== null && typeof value.exitCode !== "number") ||
		(value.message !== undefined &&
			value.message !== null &&
			typeof value.message !== "string")
	)
		throw new Error(
			"Windows managed-script supervisor wrote an invalid receipt",
		);
	return value as WindowsSupervisorReceipt;
}

export async function runWindowsManagedScript(options: {
	command: string;
	cwd: string;
	env: Record<string, string>;
	timeoutSeconds: number;
	signal: AbortSignal;
}): Promise<ManagedScriptResult> {
	const { powerShell, commandShell } = windowsSystemPaths();
	await Promise.all([access(powerShell), access(commandShell)]);
	const controlDirectory = await mkdtemp(
		join(tmpdir(), "choros-managed-script-"),
	);
	const helperPath = join(controlDirectory, "supervisor.ps1");
	const receiptNonce = randomBytes(32).toString("hex");
	const requestPath = join(controlDirectory, "request.json");
	const receiptPath = join(controlDirectory, "receipt.json");
	const cancellationPath = join(controlDirectory, "cancel");
	let helperClosed = false;
	let timedOut = false;
	let cancelled = false;
	let stopEscalator: ReturnType<typeof setTimeout> | undefined;
	let helper: ChildProcessByStdio<null, Readable, Readable> | undefined;
	const chunks: Buffer[] = [];
	let captured = 0;
	let truncated = false;
	const capture = (data: Buffer) => {
		const remaining = MAX_OUTPUT_BYTES - captured;
		if (data.length > remaining) truncated = true;
		if (remaining > 0) {
			const part = data.subarray(0, remaining);
			chunks.push(part);
			captured += part.length;
		}
	};
	const requestStop = () => {
		void writeFile(cancellationPath, "stop", { flag: "wx" }).catch(
			() => undefined,
		);
		if (!stopEscalator)
			stopEscalator = setTimeout(() => {
				if (!helperClosed) helper?.kill();
			}, SUPERVISOR_STOP_GRACE_MS);
	};
	const onAbort = () => {
		cancelled = true;
		requestStop();
	};
	let deadline: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.all([
			writeFile(helperPath, WINDOWS_JOB_SUPERVISOR, "utf8"),
			writeFile(
				requestPath,
				JSON.stringify({
					shellPath: commandShell,
					command: options.command,
					cwd: options.cwd,
				}),
				"utf8",
			),
		]);
		helper = spawn(
			powerShell,
			[
				"-NoLogo",
				"-NoProfile",
				"-NonInteractive",
				"-ExecutionPolicy",
				"Bypass",
				"-File",
				helperPath,
				requestPath,
				receiptPath,
				cancellationPath,
			],
			{
				stdio: ["ignore", "pipe", "pipe"],
				windowsHide: true,
				env: {
					...options.env,
					CHOROS_MANAGED_SCRIPT_RECEIPT_NONCE: receiptNonce,
				},
			},
		);
		helper.stdout.on("data", capture);
		helper.stderr.on("data", capture);
		options.signal.addEventListener("abort", onAbort, { once: true });
		if (options.signal.aborted) onAbort();
		deadline = setTimeout(() => {
			timedOut = true;
			requestStop();
		}, options.timeoutSeconds * 1000);
		await new Promise<void>((resolve, reject) => {
			helper?.once("error", reject);
			helper?.once("close", () => {
				helperClosed = true;
				resolve();
			});
		});

		let receipt: WindowsSupervisorReceipt | undefined;
		let receiptFailure: unknown;
		try {
			receipt = parseReceipt(await readFile(receiptPath, "utf8"), receiptNonce);
		} catch (error) {
			receiptFailure = error;
		}
		const capturedOutput = Buffer.concat(chunks);
		const unknownResult = (message: string): ManagedScriptResult => {
			const notice = Buffer.from(
				`Windows managed-script supervisor failed: ${message}\n`,
			);
			const combined = Buffer.concat([notice, capturedOutput]);
			return {
				exitCode: null,
				output: combined.subarray(0, MAX_OUTPUT_BYTES).toString("utf8"),
				truncated: truncated || combined.length > MAX_OUTPUT_BYTES,
				timedOut,
				cancelled,
				quiescent: false,
			};
		};
		if (!receipt)
			return unknownResult(
				receiptFailure instanceof Error
					? receiptFailure.message
					: "no authenticated completion receipt",
			);
		if (receipt.status === "failed") {
			const message = receipt.message ?? "unknown supervisor error";
			if (!receipt.quiescent) return unknownResult(message);
			throw new Error(`Windows managed-script supervisor failed: ${message}`);
		}
		return {
			exitCode: receipt.exitCode,
			output: capturedOutput.toString("utf8"),
			truncated,
			timedOut,
			cancelled,
			quiescent: receipt.quiescent,
		};
	} finally {
		if (deadline) clearTimeout(deadline);
		if (stopEscalator) clearTimeout(stopEscalator);
		options.signal.removeEventListener("abort", onAbort);
		await rm(controlDirectory, { recursive: true, force: true });
	}
}
