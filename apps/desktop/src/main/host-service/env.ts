import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		HOST_DB_PATH: z.string().min(1),
		HOST_MIGRATIONS_FOLDER: z.string().min(1),
		HOST_SERVICE_SECRET: z.string().min(1),
		HOST_SERVICE_PORT: z.coerce.number().int().positive(),
		DESKTOP_VITE_PORT: z.coerce.number().int().positive(),
		BROWSER_BRIDGE_URL: z.string().url().optional(),
		BROWSER_BRIDGE_SECRET: z.string().min(1).optional(),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
