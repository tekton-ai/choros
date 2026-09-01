import fs from "node:fs";
import path from "node:path";
import { CHOROS_MANAGED_BINARIES } from "./agent-setup-targets";
import { NOTIFY_SCRIPT_NAME } from "./notify-hook";
import { getBinDir } from "./paths";

export const WRAPPER_MARKER = "# Choros agent-wrapper v4";
export { CHOROS_MANAGED_BINARIES };

/** Path (under CHOROS_HOME_DIR) of the runtime notify hook script. */
export const MANAGED_NOTIFY_RELATIVE_PATH = `hooks/${NOTIFY_SCRIPT_NAME}`;

/**
 * Literal substring every guarded managed command contains. Managed-command
 * predicates must match it: the guarded form carries neither an absolute
 * notify path nor a `/.choros/` segment, so without this check a re-merge
 * would fail to recognize its own entries and append duplicates.
 */
export const DYNAMIC_NOTIFY_PATH_MARKER = `$CHOROS_HOME_DIR/${MANAGED_NOTIFY_RELATIVE_PATH}`;

/**
 * Shell command written into an agent's global hook config. The notify path is
 * resolved at runtime from CHOROS_HOME_DIR so one shared config works for both
 * dev and prod installs, and `CHOROS_AGENT_ID` is inlined so the v2 hook
 * payload carries wrapper-level identity even when the agent is launched outside
 * the Choros wrapper (system PATH resolves the real binary directly).
 */
export function getManagedNotifyHookCommand(agentId: string): string {
	return `[ -n "$CHOROS_HOME_DIR" ] && [ -x "$CHOROS_HOME_DIR/${MANAGED_NOTIFY_RELATIVE_PATH}" ] && CHOROS_AGENT_ID=${agentId} "$CHOROS_HOME_DIR/${MANAGED_NOTIFY_RELATIVE_PATH}" || true`;
}

// Dev setup (.choros/lib/setup/steps.sh) points CHOROS_HOME_DIR at
// $PWD/choros-dev-data — without a leading dot — so we must recognize that
// variant to reap stale notify.sh paths from deleted worktrees.
const CHOROS_MANAGED_HOOK_PATH_PATTERN =
	/\/(?:\.choros(?:-[^/'"\s\\]+)?|choros-dev-data)\//;

import { writeFileIfChanged } from "./write-file-if-changed";

export { writeFileIfChanged };

/**
 * Deletes a wholly Choros-owned file, gated on its content signature so a
 * user file at the same path is never removed.
 */
export function removeOwnedFileIfMarked(
	filePath: string,
	signature: string,
	label: string,
): void {
	try {
		if (!fs.existsSync(filePath)) return;
		const content = fs.readFileSync(filePath, "utf-8");
		if (!content.includes(signature)) return;
		fs.unlinkSync(filePath);
		console.log(`[agent-setup] Removed ${label}`);
	} catch (error) {
		console.warn(`[agent-setup] Failed to remove ${label}:`, error);
	}
}

export function isChorosManagedHookCommand(
	command: string | undefined,
	scriptName: string,
): boolean {
	if (!command) return false;
	const normalized = command.replaceAll("\\", "/");
	if (!normalized.includes(`/hooks/${scriptName}`)) return false;
	return CHOROS_MANAGED_HOOK_PATH_PATTERN.test(normalized);
}

/**
 * Recognizes every form of Choros's notify hook command: the current
 * guarded form (dynamic marker), a current absolute notify path, and stale
 * absolute paths from other installs/worktrees.
 */
export function isManagedNotifyCommand(
	command: string | undefined,
	notifyScriptPath: string,
): boolean {
	return Boolean(
		command?.includes(notifyScriptPath) ||
			command?.includes(DYNAMIC_NOTIFY_PATH_MARKER) ||
			isChorosManagedHookCommand(command, NOTIFY_SCRIPT_NAME),
	);
}

function buildRealBinaryResolver(): string {
	return `find_real_binary() {
  local name="$1"
  local IFS=:
  for dir in $PATH; do
    [ -z "$dir" ] && continue
    dir="\${dir%/}"
    case "$dir" in
      "${getBinDir()}"|"$HOME"/.choros/bin|"$HOME"/.choros-*/bin) continue ;;
    esac
    if [ -x "$dir/$name" ] && [ ! -d "$dir/$name" ]; then
      printf "%s\\n" "$dir/$name"
      return 0
    fi
  done
  return 1
}
`;
}

/**
 * Shell block that re-resolves the Usage-tab default account at launch.
 * The PTY env is frozen at terminal spawn, so an account switch would
 * otherwise reach only brand-new terminals; this re-reads the host's
 * pointer file every time the agent starts instead. Choros terminals
 * only, and a value the user exported by hand — one that differs from what
 * Choros injected at spawn — always wins. A missing pointer file (older
 * host build) changes nothing; an empty one means the system default.
 */
export function buildDefaultAccountResolver(
	envVar: string,
	pointerName: string,
): string {
	const pointer = `"$CHOROS_HOME_DIR/state/${pointerName}"`;
	return `if [ -n "$CHOROS_TERMINAL_ID" ] && [ -n "$CHOROS_HOME_DIR" ] \\
  && { [ -z "\${${envVar}}" ] || [ "\${${envVar}}" = "\${CHOROS_DEFAULT_${envVar}}" ]; } \\
  && [ -f ${pointer} ]; then
  choros_default_account="$(cat ${pointer} 2>/dev/null)"
  if [ -n "$choros_default_account" ] && [ -d "$choros_default_account" ]; then
    export ${envVar}="$choros_default_account"
  else
    unset ${envVar}
  fi
fi

`;
}

function getMissingBinaryMessage(name: string): string {
	return `Choros: ${name} not found in PATH. Install it and ensure it is on PATH, then retry.`;
}

export function getWrapperPath(binaryName: string): string {
	return path.join(getBinDir(), binaryName);
}

export interface BuildWrapperScriptOptions {
	/**
	 * `BuiltinAgentId` for the wrapped binary (e.g. "claude", "codex"). When
	 * set, the wrapper exports `CHOROS_AGENT_ID` so the agent process and
	 * any hook subprocess it spawns inherit the wrapper-level identity. The
	 * notify-hook script forwards this into the v2 hook payload.
	 */
	agentId?: string;
}

/**
 * Shell block that reports the agent launch to the host so the terminal gets
 * an agent binding the moment a harness starts — not on its first native hook.
 * Some harnesses defer their SessionStart hook until the first turn (Codex
 * creates its rollout lazily, so an idle or resumed TUI fires nothing) and
 * some have no session hooks at all (vibe); the wrapper is the one launch-time
 * signal every harness shares. The report is delayed and liveness-gated so
 * `--help`-style probes that exit right away never bind a pane, and the
 * subshell survives `exec` — after it, the captured pid IS the agent process.
 * Harnesses with working native SessionStart hooks fire too; the host upsert
 * makes the duplicate harmless and lets them attach the real session id.
 */
function buildLaunchReportBlock(): string {
	return `_choros_skip_launch_report=""
for _choros_arg in "$@"; do
  # Tokens past \`--\` are prompt text, never flags.
  [ "$_choros_arg" = "--" ] && break
  case "$_choros_arg" in
    --help|-h|--version|-V|-v)
      _choros_skip_launch_report="1"
      break
      ;;
  esac
done
if [ -z "$_choros_skip_launch_report" ] && [ -n "$CHOROS_TERMINAL_ID" ] \\
  && [ -n "$CHOROS_HOME_DIR" ] && [ -x "$CHOROS_HOME_DIR/${MANAGED_NOTIFY_RELATIVE_PATH}" ]; then
  _choros_launch_pid=$$
  (
    sleep 2
    kill -0 "$_choros_launch_pid" 2>/dev/null || exit 0
    exec "$CHOROS_HOME_DIR/${MANAGED_NOTIFY_RELATIVE_PATH}" '{"hook_event_name":"SessionStart"}'
  ) >/dev/null 2>&1 </dev/null &
fi

`;
}

export function buildWrapperScript(
	binaryName: string,
	execLine: string,
	options: BuildWrapperScriptOptions = {},
): string {
	const exportAgentId = options.agentId
		? `export CHOROS_AGENT_ID="${options.agentId}"\n\n`
		: "";
	const launchReport = options.agentId ? buildLaunchReportBlock() : "";
	return `#!/bin/bash
${WRAPPER_MARKER}
# Choros wrapper for ${binaryName}

${buildRealBinaryResolver()}
REAL_BIN="$(find_real_binary "${binaryName}")"
if [ -z "$REAL_BIN" ]; then
  echo "${getMissingBinaryMessage(binaryName)}" >&2
  exit 127
fi

${exportAgentId}${launchReport}${execLine}
`;
}

export function createWrapper(binaryName: string, script: string): void {
	const changed = writeFileIfChanged(getWrapperPath(binaryName), script, 0o755);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} ${binaryName} wrapper`,
	);
}
