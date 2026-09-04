import { useMemo } from "react";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/host-workspaces-provider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/local-host-service-provider";

export type WorkspaceHostTarget =
	| { status: "loading" }
	| { status: "not-found" }
	| { status: "local-starting"; hostId: string }
	| {
			status: "ready";
			kind: "local";
			hostId: string;
			url: string;
	  };

export function useWorkspaceHostTarget(
	workspaceId: string | null,
): WorkspaceHostTarget {
	const { machineId, activeHostUrl } = useLocalHostService();
	const { workspaces, isReady } = useHostWorkspaces();
	const match = workspaceId
		? (workspaces.find((workspace) => workspace.id === workspaceId) ?? null)
		: null;

	return useMemo(() => {
		if (!workspaceId || (!isReady && !match)) return { status: "loading" };
		if (!match || match.hostId !== machineId) return { status: "not-found" };
		if (!activeHostUrl) {
			return { status: "local-starting", hostId: match.hostId };
		}
		return {
			status: "ready",
			kind: "local",
			hostId: match.hostId,
			url: activeHostUrl,
		};
	}, [activeHostUrl, isReady, machineId, match, workspaceId]);
}

export function useWorkspaceHostUrl(workspaceId: string | null): string | null {
	const target = useWorkspaceHostTarget(workspaceId);
	return target.status === "ready" ? target.url : null;
}
