import type { AppRouter as HostServiceRouter } from "@choros/host-service/trpc";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import SuperJSON from "superjson";

export interface LocalHostAuth {
	/** Bearer token issued by the local Host manifest or another trusted provider. */
	token: string;
	/** Stable machine identity sent when the Host requires machine-bound access. */
	clientMachineId?: string;
}

export type LocalHostAuthProvider = () =>
	| LocalHostAuth
	| Promise<LocalHostAuth>;

export interface LocalHostClientOptions {
	/** Local Host HTTP endpoint, with or without the trailing `/trpc`. */
	endpoint: string;
	/** Called for every batch so token rotation does not require rebuilding the client. */
	auth: LocalHostAuthProvider;
}

export type LocalHostClient = ReturnType<
	typeof createTRPCClient<HostServiceRouter>
>;

/**
 * Creates a typed client for one explicitly selected local Choros Host.
 *
 * This transport never exchanges a cloud API key, selects an organization, or
 * routes through the relay. The caller owns endpoint discovery and credentials.
 */
export function createLocalHostClient(
	options: LocalHostClientOptions,
): LocalHostClient {
	const endpoint = options.endpoint.replace(/\/+$/, "");
	const url = endpoint.endsWith("/trpc") ? endpoint : `${endpoint}/trpc`;

	return createTRPCClient<HostServiceRouter>({
		links: [
			httpBatchLink({
				url,
				transformer: SuperJSON,
				headers: async () => {
					const auth = await options.auth();
					return {
						Authorization: `Bearer ${auth.token}`,
						...(auth.clientMachineId
							? { "x-choros-client-machine-id": auth.clientMachineId }
							: {}),
					};
				},
			}),
		],
	});
}
