import path from "node:path";
import { createEnv } from "@t3-oss/env-core";
import { config } from "dotenv";
import { z } from "zod";

// Load .env from monorepo root — only in Node/Bun where __dirname exists and
// a filesystem is reachable. Cloudflare Workers reach here too (packages/auth
// imports us transitively) but have no fs and no __dirname; the env values
// they need arrive as bindings/secrets rather than through a dotfile.
try {
	// biome-ignore lint/correctness/noUndeclaredVariables: dev-only Node runtime probe
	const dir = typeof __dirname !== "undefined" ? __dirname : ".";
	config({ path: path.resolve(dir, "../../../.env"), quiet: true });
} catch {}

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().url(),
		DATABASE_URL_UNPOOLED: z.string().url(),
	},

	clientPrefix: "PUBLIC_",

	client: {},

	runtimeEnv: process.env,

	emptyStringAsUndefined: true,
	// IMPORTANT: Do not re-enable import-time validation here.
	// `@choros/db` is imported transitively by packages that run in environments
	// where DB env vars are intentionally absent (e.g. desktop host bundles).
	// Validating on import causes those runtimes to crash even when no DB query is
	// executed. Validation must stay deferred until actual DB client usage.
	skipValidation: true,
});
