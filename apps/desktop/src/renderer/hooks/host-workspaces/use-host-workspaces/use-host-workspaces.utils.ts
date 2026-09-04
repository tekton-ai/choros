import type {
	HostConnectionState,
	WorkspaceSnapshotPayload,
} from "@choros/workspace-client";

export interface HostWorkspaceRow {
	id: string;
	projectId: string | null;
	hostId: string;
	name: string;
	branch: string;
	type: "main" | "worktree" | "session";
	createdByUserId: string | null;
	taskId: string | null;
	createdAt: Date;
	updatedAt: Date;
	worktreePath: string;
	worktreeExists: boolean;
	projectName?: string | null;
	tags?: string[];
	archivedAt?: number | null;
	archiveReason?: "merged" | "deleted" | null;
}

export interface HostWorkspaceItem extends HostWorkspaceRow {
	hostReachable: boolean;
}

export const HOST_WORKSPACES_QUERY_KEY = [
	"host-service",
	"workspaces",
	"list",
] as const;
export const HOST_ARCHIVED_WORKSPACES_QUERY_KEY = [
	"host-service",
	"workspaces",
	"archived",
] as const;

export function applyWorkspaceChangedEvent(
	rows: HostWorkspaceRow[] | undefined,
	event: {
		eventType: "created" | "updated" | "deleted";
		workspace: WorkspaceSnapshotPayload | null;
	},
	machineId: string,
	workspaceId: string,
): HostWorkspaceRow[] | undefined {
	if (event.eventType === "deleted") {
		if (!rows) return rows;
		const next = rows.filter((row) => row.id !== workspaceId);
		return next.length === rows.length ? rows : next;
	}
	const workspace = event.workspace;
	if (!workspace) return rows;
	const existing = rows?.find((row) => row.id === workspace.id);
	const next: HostWorkspaceRow = {
		id: workspace.id,
		projectId: workspace.projectId,
		hostId: machineId,
		name: workspace.name,
		branch: workspace.branch,
		type: workspace.type,
		createdByUserId: workspace.createdByUserId,
		taskId: workspace.taskId,
		createdAt: new Date(workspace.createdAt),
		updatedAt: new Date(workspace.updatedAt),
		worktreePath: workspace.worktreePath,
		worktreeExists: true,
		tags: workspace.tags,
		archivedAt: null,
		archiveReason: null,
	};
	if (!rows) return [next];
	return existing
		? rows.map((row) => (row.id === next.id ? { ...row, ...next } : row))
		: [...rows, next];
}

export function isEventBusReopen(
	everOpened: boolean,
	nextState: HostConnectionState,
): boolean {
	return everOpened && nextState === "open";
}
