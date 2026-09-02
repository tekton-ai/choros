import { randomUUID } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { env } from "./env";

export type ChorosConfig = {
	auth?: {
		accessToken: string;
		refreshToken?: string;
		expiresAt: number;
	};
	apiKey?: string;
	organizationId?: string;
};

export const CHOROS_HOME_DIR =
	process.env.CHOROS_HOME_DIR ?? join(homedir(), ".choros");
export const CHOROS_CONFIG_PATH = join(CHOROS_HOME_DIR, "config.json");

function ensureDir() {
	if (!existsSync(CHOROS_HOME_DIR)) {
		mkdirSync(CHOROS_HOME_DIR, { recursive: true, mode: 0o700 });
	}
	try {
		const stat = statSync(CHOROS_HOME_DIR);
		if ((stat.mode & 0o077) !== 0) chmodSync(CHOROS_HOME_DIR, 0o700);
	} catch {}
}

export function readConfig(): ChorosConfig {
	if (!existsSync(CHOROS_CONFIG_PATH)) return {};
	try {
		const stat = statSync(CHOROS_CONFIG_PATH);
		if ((stat.mode & 0o077) !== 0) chmodSync(CHOROS_CONFIG_PATH, 0o600);
	} catch {}
	return JSON.parse(readFileSync(CHOROS_CONFIG_PATH, "utf-8"));
}

/**
 * CHOROS_ORGANIZATION_ID overrides the stored org for this invocation
 * (headless/CI, and dev where the CLI must target a specific local org),
 * mirroring how CHOROS_API_KEY overrides the stored credential. Not
 * persisted to disk.
 */
export function resolveOrganizationId(
	config: ChorosConfig,
): string | undefined {
	return process.env.CHOROS_ORGANIZATION_ID?.trim() || config.organizationId;
}

export function writeConfig(config: ChorosConfig): void {
	ensureDir();
	const tempPath = join(
		CHOROS_HOME_DIR,
		`.${randomUUID()}.${process.pid}.config.tmp`,
	);
	writeFileSync(tempPath, JSON.stringify(config, null, 2), { mode: 0o600 });
	try {
		chmodSync(tempPath, 0o600);
	} catch {}
	try {
		renameSync(tempPath, CHOROS_CONFIG_PATH);
	} catch (error) {
		try {
			unlinkSync(tempPath);
		} catch {}
		throw error;
	}
	try {
		chmodSync(CHOROS_CONFIG_PATH, 0o600);
	} catch {}
}

export function getApiUrl(): string {
	return env.CHOROS_API_URL;
}
