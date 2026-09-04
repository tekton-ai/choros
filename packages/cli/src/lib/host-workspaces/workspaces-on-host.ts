import { type HostServiceClient, resolveHostTarget } from "../host-target";

export type HostWorkspaceRow = Awaited<
	ReturnType<HostServiceClient["workspace"]["list"]["query"]>
>[number];

export async function listWorkspacesOnHost(): Promise<{
	hostId: string;
	workspaces: HostWorkspaceRow[];
}> {
	const target = await resolveHostTarget();
	return {
		hostId: target.hostId,
		workspaces: await target.client.workspace.list.query(),
	};
}

export async function findWorkspaceOnHost(
	workspaceId: string,
): Promise<{ hostId: string; workspace: HostWorkspaceRow | undefined }> {
	const { hostId, workspaces } = await listWorkspacesOnHost();
	return {
		hostId,
		workspace: workspaces.find((workspace) => workspace.id === workspaceId),
	};
}
