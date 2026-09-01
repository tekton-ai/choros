import { CLIError } from "@choros/cli-framework";
import { type ApiClient, createApiClient } from "./api-client";
import { refreshAccessToken } from "./auth";
import {
	readConfig,
	resolveOrganizationId,
	type ChorosConfig,
	writeConfig,
} from "./config";

export type AuthSource = "override" | "config" | "oauth";

export type ResolvedAuth = {
	config: ChorosConfig;
	api: ApiClient;
	bearer: string;
	authSource: AuthSource;
};

const REFRESH_LEEWAY_MS = 5 * 60 * 1000;

export async function resolveAuth(
	apiKeyOption: string | undefined,
): Promise<ResolvedAuth> {
	let config = readConfig();

	// An explicit --api-key wins; otherwise SUPERSET_API_KEY env acts as an
	// override for this invocation (headless/CI). Both beat stored config/OAuth.
	const overrideKey =
		apiKeyOption?.trim() || process.env.SUPERSET_API_KEY?.trim();
	let bearer: string | undefined;
	let authSource: AuthSource;

	if (overrideKey) {
		bearer = overrideKey;
		authSource = "override";
	} else if (config.apiKey?.trim()) {
		bearer = config.apiKey.trim();
		authSource = "config";
	} else if (config.auth) {
		const auth = config.auth;
		if (auth.expiresAt - REFRESH_LEEWAY_MS < Date.now()) {
			if (!auth.refreshToken) {
				throw new CLIError("Session expired", "Run: choros auth login");
			}
			try {
				const refreshed = await refreshAccessToken(auth.refreshToken);
				config = {
					...config,
					auth: {
						accessToken: refreshed.accessToken,
						refreshToken: refreshed.refreshToken,
						expiresAt: refreshed.expiresAt,
					},
				};
				writeConfig(config);
				bearer = refreshed.accessToken;
			} catch {
				throw new CLIError("Session expired", "Run: choros auth login");
			}
		} else {
			bearer = auth.accessToken;
		}
		authSource = "oauth";
	} else {
		throw new CLIError(
			"Not logged in",
			"Run: choros auth login (or set SUPERSET_API_KEY)",
		);
	}

	const organizationId = resolveOrganizationId(config);
	const resolvedConfig: ChorosConfig = { ...config, organizationId };

	const api = createApiClient({ bearer, organizationId });
	return { config: resolvedConfig, api, bearer, authSource };
}
