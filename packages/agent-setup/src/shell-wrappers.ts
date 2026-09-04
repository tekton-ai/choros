import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	CHOROS_MANAGED_BINARIES,
	type ChorosManagedBinary,
} from "./agent-setup-targets";
import { getBashDir, getBinDir, getZshDir } from "./paths";
import { writeFileIfChanged } from "./write-file-if-changed";

export interface ShellWrapperPaths {
	BIN_DIR: string;
	ZSH_DIR: string;
	BASH_DIR: string;
}

// Resolved lazily (as a default-parameter expression) so CHOROS_HOME_DIR
// changes made during boot are picked up.
function getDefaultPaths(): ShellWrapperPaths {
	return {
		BIN_DIR: getBinDir(),
		ZSH_DIR: getZshDir(),
		BASH_DIR: getBashDir(),
	};
}

const modeDiagnosticsLogged = new Set<string>();

function getShellName(shell: string): string {
	return shell.split("/").pop() || shell;
}

/**
 * Shell snippet to save all CHOROS_* env vars before sourcing user RC files.
 * Used in tandem with {@link CHOROS_ENV_RESTORE} to prevent user shell
 * configs from overriding Choros-managed environment variables (e.g.
 * CHOROS_WORKSPACE_NAME).
 *
 * @see https://github.com/AidenIO/choros/issues/2386
 */
const CHOROS_ENV_SAVE = `_choros_saved_env="$(export -p 2>/dev/null | grep ' CHOROS_')"`;

/**
 * Shell snippet to restore previously saved CHOROS_* env vars after
 * sourcing user RC files.
 */
const CHOROS_ENV_RESTORE = `eval "$_choros_saved_env" 2>/dev/null || true`;

function quoteShellLiteral(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function logModeDiagnostics(shellName: string): void {
	const key = `${shellName}:native`;
	if (modeDiagnosticsLogged.has(key)) return;
	modeDiagnosticsLogged.add(key);
	console.debug(
		`[agent-setup] shell integration mode=native shell=${shellName}`,
	);
}

/**
 * Build shell function wrappers for managed binaries (claude, codex, etc.)
 * that prefer BIN_DIR executables over system-installed ones.
 */
function buildManagedCommandPrelude(shellName: string, binDir: string): string {
	if (shellName === "fish") {
		const escapedBinDir = escapeFishDoubleQuoted(binDir);
		return CHOROS_MANAGED_BINARIES.map(
			(name: ChorosManagedBinary) =>
				`functions -q ${name}; and functions -e ${name}
function ${name}
  set -l _choros_wrapper "${escapedBinDir}/${name}"
  if test -x "$_choros_wrapper"; and not test -d "$_choros_wrapper"
    "$_choros_wrapper" $argv
  else
    command ${name} $argv
  end
end`,
		).join("\n");
	}

	return CHOROS_MANAGED_BINARIES.map(
		(name: ChorosManagedBinary) =>
			`unalias ${name} 2>/dev/null || true
${name}() {
  _choros_wrapper=${quoteShellLiteral(`${binDir}/${name}`)}
  if [ -x "$_choros_wrapper" ] && [ ! -d "$_choros_wrapper" ]; then
    "$_choros_wrapper" "$@"
  else
    command ${name} "$@"
  fi
}`,
	).join("\n");
}

/** Build a shell snippet that idempotently prepends BIN_DIR to PATH. */
function buildPathPrependFunction(binDir: string): string {
	return `_choros_prepend_bin() {
  case ":$PATH:" in
    *:${quoteShellLiteral(binDir)}:*) ;;
    *) export PATH=${quoteShellLiteral(binDir)}:"$PATH" ;;
  esac
}
_choros_prepend_bin`;
}

/**
 * Build a zsh precmd hook that re-asserts BIN_DIR in PATH.
 * Tools like mise/asdf register precmd hooks that reconstruct PATH,
 * which can remove our BIN_DIR. This is intentionally best-effort so
 * unusual user zsh configs don't break shell startup.
 */
function buildZshPrecmdHook(binDir: string): string {
	return `typeset -ga precmd_functions 2>/dev/null || true
_choros_ensure_path() {
  case ":$PATH:" in
    *:${quoteShellLiteral(binDir)}:*) ;;
    *) PATH=${quoteShellLiteral(binDir)}:"$PATH" ;;
  esac
}
{
  # Keep our hook last so it wins over other PATH-mutating precmd hooks.
  precmd_functions=(\${precmd_functions:#_choros_ensure_path} _choros_ensure_path)
} 2>/dev/null || true`;
}

function escapeFishDoubleQuoted(value: string): string {
	return value
		.replaceAll("\\", "\\\\")
		.replaceAll('"', '\\"')
		.replaceAll("$", "\\$");
}

export function createZshWrapper(
	paths: ShellWrapperPaths = getDefaultPaths(),
): void {
	logModeDiagnostics("zsh");
	const quotedZshDir = quoteShellLiteral(paths.ZSH_DIR);

	// .zshenv is always sourced first by zsh (interactive + non-interactive).
	// Temporarily restore the user's ZDOTDIR while sourcing user config, then
	// switch back so zsh continues through our wrapper chain.
	const zshenvPath = path.join(paths.ZSH_DIR, ".zshenv");
	const zshenvScript = `# Choros zsh env wrapper
${CHOROS_ENV_SAVE}
_choros_home="\${CHOROS_ORIG_ZDOTDIR:-$HOME}"
export ZDOTDIR="$_choros_home"
[[ -f "$_choros_home/.zshenv" ]] && source "$_choros_home/.zshenv"
${CHOROS_ENV_RESTORE}
export ZDOTDIR=${quotedZshDir}
`;
	const wroteZshenv = writeFileIfChanged(zshenvPath, zshenvScript, 0o644);

	// Source user .zprofile with their ZDOTDIR, then restore wrapper ZDOTDIR
	// so startup continues into our .zshrc wrapper.
	const zprofilePath = path.join(paths.ZSH_DIR, ".zprofile");
	const zprofileScript = `# Choros zsh profile wrapper
${CHOROS_ENV_SAVE}
_choros_home="\${CHOROS_ORIG_ZDOTDIR:-$HOME}"
export ZDOTDIR="$_choros_home"
[[ -f "$_choros_home/.zprofile" ]] && source "$_choros_home/.zprofile"
${CHOROS_ENV_RESTORE}
export ZDOTDIR=${quotedZshDir}
`;
	const wroteZprofile = writeFileIfChanged(zprofilePath, zprofileScript, 0o644);

	// Reset ZDOTDIR before sourcing so Oh My Zsh works correctly
	const zshrcPath = path.join(paths.ZSH_DIR, ".zshrc");
	const zshrcScript = `# Choros zsh rc wrapper
${CHOROS_ENV_SAVE}
_choros_home="\${CHOROS_ORIG_ZDOTDIR:-$HOME}"
export ZDOTDIR="$_choros_home"
[[ -f "$_choros_home/.zshrc" ]] && source "$_choros_home/.zshrc"
${CHOROS_ENV_RESTORE}
${buildPathPrependFunction(paths.BIN_DIR)}
${buildZshPrecmdHook(paths.BIN_DIR)}
rehash 2>/dev/null || true
# Restore ZDOTDIR so our .zlogin runs after user's .zlogin
export ZDOTDIR=${quotedZshDir}
`;
	const wroteZshrc = writeFileIfChanged(zshrcPath, zshrcScript, 0o644);

	// .zlogin runs AFTER .zshrc in login shells. By restoring ZDOTDIR above,
	// zsh sources our .zlogin instead of the user's directly. We source the
	// user's .zlogin only for interactive shells, then re-assert Choros's
	// PATH prepend after user startup hooks run.
	const zloginPath = path.join(paths.ZSH_DIR, ".zlogin");
	const zloginScript = `# Choros zsh login wrapper
${CHOROS_ENV_SAVE}
_choros_home="\${CHOROS_ORIG_ZDOTDIR:-$HOME}"
export ZDOTDIR="$_choros_home"
if [[ -o interactive ]]; then
  [[ -f "$_choros_home/.zlogin" ]] && source "$_choros_home/.zlogin"
fi
${CHOROS_ENV_RESTORE}
${buildZshPrecmdHook(paths.BIN_DIR)}
${buildPathPrependFunction(paths.BIN_DIR)}
rehash 2>/dev/null || true
# Shell readiness markers. Emitting both keeps us compatible across daemon
# versions: the legacy v1 daemon scans for OSC 777, the current scanner (v1
# post-refactor + v2 host-service) scans for OSC 133;A (FinalTerm standard).
# Wrappers are rewritten on every app launch, so main always ships the
# choros of markers; daemons that only get restarted on protocol bumps
# still match against their own scanner.
# Protocol ref: https://gitlab.freedesktop.org/Per_Bothner/specifications/blob/master/proposals/semantic-prompts.md
__choros_prompt_mark() {
  printf "\\033]777;choros-shell-ready\\007\\033]133;A\\007"
}
# Keep our hook LAST so it fires after direnv and other precmd hooks complete.
precmd_functions=(\${precmd_functions[@]} __choros_prompt_mark)
export ZDOTDIR="$_choros_home"
`;
	const wroteZlogin = writeFileIfChanged(zloginPath, zloginScript, 0o644);
	const changed = wroteZshenv || wroteZprofile || wroteZshrc || wroteZlogin;
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} zsh wrapper files`,
	);
}

export function createBashWrapper(
	paths: ShellWrapperPaths = getDefaultPaths(),
): void {
	logModeDiagnostics("bash");

	const rcfilePath = path.join(paths.BASH_DIR, "rcfile");
	const script = `# Choros bash rcfile wrapper

# Save Choros env vars before sourcing user config
${CHOROS_ENV_SAVE}

# Source system profile
[[ -f /etc/profile ]] && source /etc/profile

# Source user's login profile
if [[ -f "$HOME/.bash_profile" ]]; then
  source "$HOME/.bash_profile"
elif [[ -f "$HOME/.bash_login" ]]; then
  source "$HOME/.bash_login"
elif [[ -f "$HOME/.profile" ]]; then
  source "$HOME/.profile"
fi

# Source bashrc if separate
[[ -f "$HOME/.bashrc" ]] && source "$HOME/.bashrc"

# Restore Choros env vars that user config may have overridden
${CHOROS_ENV_RESTORE}

# Keep choros bin first without duplicating entries
${buildPathPrependFunction(paths.BIN_DIR)}
hash -r 2>/dev/null || true
# Minimal prompt (path/env shown in toolbar) - emerald to match app theme
export PS1=$'\\[\\e[1;38;2;52;211;153m\\]❯\\[\\e[0m\\] '
# Shell readiness markers — see zsh wrapper for rationale on emitting both.
# Protocol ref: https://gitlab.freedesktop.org/Per_Bothner/specifications/blob/master/proposals/semantic-prompts.md
__choros_prompt_mark() {
  printf "\\033]777;choros-shell-ready\\007\\033]133;A\\007"
}
# Hook via PROMPT_COMMAND. Supports both scalar and array forms (Bash 5.1+).
if [[ "$(declare -p PROMPT_COMMAND 2>/dev/null)" == "declare -a"* ]]; then
  PROMPT_COMMAND=("\${PROMPT_COMMAND[@]}" "__choros_prompt_mark")
else
  _choros_orig_prompt_cmd="\${PROMPT_COMMAND}"
  if [[ -n "\${_choros_orig_prompt_cmd}" ]]; then
    PROMPT_COMMAND="\${_choros_orig_prompt_cmd};__choros_prompt_mark"
  else
    PROMPT_COMMAND="__choros_prompt_mark"
  fi
fi
`;
	const changed = writeFileIfChanged(rcfilePath, script, 0o644);
	console.log(`[agent-setup] ${changed ? "Updated" : "Verified"} bash wrapper`);
}

export function getShellEnv(
	shell: string,
	paths: ShellWrapperPaths = getDefaultPaths(),
): Record<string, string> {
	const shellName = getShellName(shell);
	if (shellName === "zsh") {
		return {
			CHOROS_ORIG_ZDOTDIR: process.env.ZDOTDIR || os.homedir(),
			ZDOTDIR: paths.ZSH_DIR,
		};
	}
	return {};
}

export function getShellArgs(
	shell: string,
	paths: ShellWrapperPaths = getDefaultPaths(),
): string[] {
	const shellName = getShellName(shell);
	logModeDiagnostics(shellName);
	if (shellName === "bash") {
		return ["--rcfile", path.join(paths.BASH_DIR, "rcfile")];
	}
	if (shellName === "fish") {
		// Use --init-command to prepend BIN_DIR to PATH after config is loaded.
		// Use fish list-aware checks to avoid duplicate PATH entries across nested shells.
		// Emit both OSC 777 (legacy v1 daemon) and OSC 133;A (current scanner)
		// on fish_prompt. See zsh wrapper for rationale.
		const escapedBinDir = escapeFishDoubleQuoted(paths.BIN_DIR);
		return [
			"-l",
			"--init-command",
			[
				`set -l _choros_bin "${escapedBinDir}"`,
				`contains -- "$_choros_bin" $PATH`,
				`or set -gx PATH "$_choros_bin" $PATH`,
				`function _choros_prompt_mark --on-event fish_prompt`,
				`printf '\\033]777;choros-shell-ready\\007\\033]133;A\\007'`,
				`end`,
			].join("; "),
		];
	}
	if (["zsh", "sh", "ksh"].includes(shellName)) {
		return ["-l"];
	}
	return [];
}

/**
 * Shell args for non-interactive command execution (`-c`) that sources
 * user profiles via wrappers. Falls back to login shell if wrappers
 * don't exist yet (e.g. before setupAgentIntegrations runs).
 *
 * Unlike getShellArgs (interactive), we must source profiles inline because:
 * - zsh skips .zshrc for non-interactive shells
 * - bash ignores --rcfile when -c is present
 * - managed binary prelude enforces wrapper paths for app-owned commands
 */
export function getCommandShellArgs(
	shell: string,
	command: string,
	paths: ShellWrapperPaths = getDefaultPaths(),
): string[] {
	const shellName = getShellName(shell);
	logModeDiagnostics(shellName);
	const zshRc = path.join(paths.ZSH_DIR, ".zshrc");
	const bashRcfile = path.join(paths.BASH_DIR, "rcfile");
	const commandWithManagedPrelude = `${buildManagedCommandPrelude(shellName, paths.BIN_DIR)}\n${command}`;
	if (shellName === "zsh" && fs.existsSync(zshRc)) {
		return [
			"-lc",
			`source ${quoteShellLiteral(zshRc)} &&\n${commandWithManagedPrelude}`,
		];
	}
	if (shellName === "bash" && fs.existsSync(bashRcfile)) {
		return [
			"-c",
			`source ${quoteShellLiteral(bashRcfile)} &&\n${commandWithManagedPrelude}`,
		];
	}
	return ["-lc", commandWithManagedPrelude];
}
