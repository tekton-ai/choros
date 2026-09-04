export const DEFAULT_AUTH_SERVICE_URL = "https://choros.xchunzhao.workers.dev";

const RETIRED_AUTH_SERVICE_URL = "https://api.choros.sh";

export function resolveAuthServiceUrl(value: string | undefined): string {
	if (!value || value === RETIRED_AUTH_SERVICE_URL) {
		return DEFAULT_AUTH_SERVICE_URL;
	}
	return value;
}
