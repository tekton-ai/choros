import os from "node:os";
import path from "node:path";

/**
 * Canonical Choros home directory resolution, shared by every process that
 * provisions or consumes ~/.choros artifacts (Electron main, host-service,
 * CLI). Resolved lazily because the desktop rewrites CHOROS_HOME_DIR into
 * process.env during boot (dev-workspace builds use ~/.choros-<workspace>),
 * and headless hosts may not have it set at all.
 */
export function resolveChorosHomeDir(): string {
	return (
		process.env.CHOROS_HOME_DIR?.trim() || path.join(os.homedir(), ".choros")
	);
}

export function getBinDir(): string {
	return path.join(resolveChorosHomeDir(), "bin");
}

export function getHooksDir(): string {
	return path.join(resolveChorosHomeDir(), "hooks");
}

export function getZshDir(): string {
	return path.join(resolveChorosHomeDir(), "zsh");
}

export function getBashDir(): string {
	return path.join(resolveChorosHomeDir(), "bash");
}

export function getOpenCodeConfigDir(): string {
	return path.join(getHooksDir(), "opencode");
}

export function getOpenCodePluginDir(): string {
	return path.join(getOpenCodeConfigDir(), "plugin");
}
