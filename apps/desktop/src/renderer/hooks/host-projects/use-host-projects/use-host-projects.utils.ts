import type { ProjectSnapshotPayload } from "@choros/workspace-client";

export interface HostTagSetting {
	tag: string;
	displayName: string | null;
	color: string | null;
	tabOrder: number | null;
}

export interface HostProjectRow {
	id: string;
	name: string;
	repoPath: string;
	repoOwner: string | null;
	repoName: string | null;
	repoUrl: string | null;
	worktreeBaseDir: string | null;
	icon: string | null;
	color: string | null;
	createdAt: number;
	updatedAt: number;
	tagSettings?: HostTagSetting[];
}

export interface HostProjectItem {
	projectKey: string;
	id: string;
	name: string;
	repoPath?: string;
	repoOwner: string | null;
	repoName: string | null;
	repoUrl: string | null;
	icon: string | null;
	color: string | null;
	hostIds: string[];
	hostReachable: boolean;
	createdAt: number;
	updatedAt: number;
	tagSettings?: HostTagSetting[];
}

export const HOST_PROJECTS_QUERY_KEY = [
	"host-service",
	"projects",
	"list",
] as const;

export function normalizeHostProjectRow(
	row: Partial<HostProjectRow> & { id: string; repoPath: string },
): HostProjectRow {
	return {
		id: row.id,
		name: row.name || row.repoPath.split(/[\\/]/).pop() || row.id,
		repoPath: row.repoPath,
		repoOwner: row.repoOwner ?? null,
		repoName: row.repoName ?? null,
		repoUrl: row.repoUrl ?? null,
		worktreeBaseDir: row.worktreeBaseDir ?? null,
		icon: row.icon ?? null,
		color: row.color ?? null,
		createdAt: row.createdAt ?? 0,
		updatedAt: row.updatedAt ?? row.createdAt ?? 0,
		tagSettings: row.tagSettings,
	};
}

export function applyProjectChangedEvent(
	rows: HostProjectRow[] | undefined,
	event: {
		eventType: "created" | "updated" | "deleted";
		project: ProjectSnapshotPayload | null;
	},
	projectId: string,
): HostProjectRow[] | undefined {
	if (event.eventType === "deleted") {
		if (!rows) return rows;
		const next = rows.filter((row) => row.id !== projectId);
		return next.length === rows.length ? rows : next;
	}
	const snapshot = event.project;
	if (!snapshot) return rows;
	const existing = rows?.find((row) => row.id === snapshot.id);
	const nextRow: HostProjectRow = {
		id: snapshot.id,
		name: snapshot.name,
		repoPath: snapshot.repoPath,
		repoOwner: snapshot.repoOwner,
		repoName: snapshot.repoName,
		repoUrl: snapshot.repoUrl,
		worktreeBaseDir: snapshot.worktreeBaseDir,
		icon: snapshot.icon,
		color: snapshot.color ?? null,
		createdAt: snapshot.createdAt,
		updatedAt: snapshot.updatedAt,
		tagSettings: snapshot.tagSettings ?? existing?.tagSettings,
	};
	if (!rows) return [nextRow];
	return existing
		? rows.map((row) => (row.id === nextRow.id ? nextRow : row))
		: [...rows, nextRow];
}

export function toHostProjectItem(
	row: HostProjectRow,
	machineId: string,
	reachable: boolean,
): HostProjectItem {
	return {
		projectKey: row.id,
		id: row.id,
		name: row.name,
		repoPath: row.repoPath,
		repoOwner: row.repoOwner,
		repoName: row.repoName,
		repoUrl: row.repoUrl,
		icon: row.icon,
		color: row.color,
		hostIds: [machineId],
		hostReachable: reachable,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		tagSettings: row.tagSettings,
	};
}
