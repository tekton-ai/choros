import { createCommand } from "@choros/cli-framework";
import type { ApiClient } from "./api-client";
import type { ChorosConfig } from "./config";
import type { AuthSource } from "./resolve-auth";

export interface CliContext {
	api: ApiClient;
	config: ChorosConfig;
	bearer: string;
	authSource: AuthSource;
}

export const command = createCommand<CliContext>();
