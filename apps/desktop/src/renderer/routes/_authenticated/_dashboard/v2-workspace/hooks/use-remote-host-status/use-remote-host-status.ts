import type { HostWorkspaceItem } from "renderer/hooks/host-workspaces/use-host-workspaces";

export type RemoteHostStatus =
	| { status: "skip" }
	| { status: "loading" }
	| { status: "ready" };

export function useRemoteHostStatus(
	workspace: HostWorkspaceItem | null,
): RemoteHostStatus {
	return workspace ? { status: "skip" } : { status: "loading" };
}
