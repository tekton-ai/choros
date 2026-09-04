import path from "node:path";
import { createEnv } from "@t3-oss/env-core";
import { config } from "dotenv";
import { z } from "zod";

try {
	config({ path: path.resolve(process.cwd(), "../../../.env"), quiet: true });
} catch {}

export const env = createEnv({
	server: {
		GH_CLIENT_ID: z.string(),
		GH_CLIENT_SECRET: z.string(),
		GOOGLE_CLIENT_ID: z.string(),
		GOOGLE_CLIENT_SECRET: z.string(),
		BETTER_AUTH_SECRET: z.string(),
	},
	clientPrefix: "NEXT_PUBLIC_",
	client: {
		NEXT_PUBLIC_API_URL: z.string().url(),
		NEXT_PUBLIC_DESKTOP_URL: z.string().url().optional(),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
	skipValidation: true,
});
