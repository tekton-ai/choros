import { CLIError } from "@choros/cli-framework";
import type { AppRouter as HostServiceRouter } from "@choros/host-service/trpc";
import { getHostId } from "@choros/shared/host-info";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import SuperJSON from "superjson";
import { isProcessAlive, readManifest } from "../host/manifest";

export type HostServiceClient = ReturnType<
	typeof createTRPCClient<HostServiceRouter>
>;

export interface HostWsEndpoint {
	baseWsUrl: string;
	token: string;
}

export interface ResolvedHostTarget {
	kind: "local";
	hostId: string;
	client: HostServiceClient;
	ws: HostWsEndpoint;
}

export async function resolveHostTarget(): Promise<ResolvedHostTarget> {
	const manifest = readManifest();
	if (!manifest) {
		throw new CLIError(
			"Host service for this machine isn't running",
			"Run: choros start",
		);
	}
	if (!isProcessAlive(manifest.pid)) {
		throw new CLIError(
			"Host service manifest is stale (recorded PID is dead)",
			"Run: choros start",
		);
	}
	const hostId = getHostId();
	return {
		kind: "local",
		hostId,
		client: createTRPCClient<HostServiceRouter>({
			links: [
				httpBatchLink({
					url: `${manifest.endpoint}/trpc`,
					transformer: SuperJSON,
					headers: {
						Authorization: `Bearer ${manifest.authToken}`,
						"x-choros-client-machine-id": hostId,
					},
				}),
			],
		}),
		ws: {
			baseWsUrl: manifest.endpoint.replace(/^http/, "ws"),
			token: manifest.authToken,
		},
	};
}
