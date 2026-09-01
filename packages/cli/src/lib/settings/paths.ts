import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Resolved at call time (not module load) so tests can point
 * CHOROS_HOME_DIR at a sandbox before touching the stores.
 */
export function getChorosHomeDir(): string {
	return process.env.CHOROS_HOME_DIR ?? join(homedir(), ".choros");
}

export function getLocalDbPath(): string {
	return join(getChorosHomeDir(), "local.db");
}

export function getAppStatePath(): string {
	return join(getChorosHomeDir(), "app-state.json");
}
