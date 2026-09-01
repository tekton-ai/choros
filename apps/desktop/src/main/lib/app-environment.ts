import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CHOROS_DIR_NAME } from "shared/constants";

const CHOROS_HOME_DIR_ENV = "CHOROS_HOME_DIR";

export const CHOROS_HOME_DIR =
	process.env[CHOROS_HOME_DIR_ENV] || join(homedir(), CHOROS_DIR_NAME);
process.env[CHOROS_HOME_DIR_ENV] = CHOROS_HOME_DIR;

export const CHOROS_HOME_DIR_MODE = 0o700;
export const CHOROS_SENSITIVE_FILE_MODE = 0o600;

export function ensureChorosHomeDirExists(): void {
	if (!existsSync(CHOROS_HOME_DIR)) {
		mkdirSync(CHOROS_HOME_DIR, {
			recursive: true,
			mode: CHOROS_HOME_DIR_MODE,
		});
	}

	// Best-effort repair if the directory already existed with weak permissions.
	try {
		chmodSync(CHOROS_HOME_DIR, CHOROS_HOME_DIR_MODE);
	} catch (error) {
		console.warn(
			"[app-environment] Failed to chmod Choros home dir (best-effort):",
			CHOROS_HOME_DIR,
			error,
		);
	}
}

// For lowdb - use our own path instead of app.getPath("userData")
export const APP_STATE_PATH = join(CHOROS_HOME_DIR, "app-state.json");

// Window geometry state (separate from UI state - main process only, sync I/O)
export const WINDOW_STATE_PATH = join(CHOROS_HOME_DIR, "window-state.json");
