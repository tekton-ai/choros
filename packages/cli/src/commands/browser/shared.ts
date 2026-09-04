import type { CliContext } from "../../lib/command";
import {
	type HostServiceClient,
	type HostWsEndpoint,
	resolveHostTarget,
} from "../../lib/host-target";

export async function resolveBrowserTarget(
	_ctx: CliContext,
	_options: { workspace: string },
): Promise<{ client: HostServiceClient; hostId: string; ws: HostWsEndpoint }> {
	const target = await resolveHostTarget();
	return { client: target.client, hostId: target.hostId, ws: target.ws };
}
