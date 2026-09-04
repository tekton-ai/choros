import { randomUUID } from "node:crypto";
import { getHostId } from "@choros/shared/host-info";
import { normalizeWorkspaceTags } from "@choros/shared/workspace-tags";
import { eq, inArray } from "drizzle-orm";
import type { HostDb } from "../db";
import { workspaces, workspaceTags } from "../db/schema";
import type { EventBus } from "../events";
import type { WorkspaceSnapshot } from "../events/types";

export type HostWorkspaceRow = typeof workspaces.$inferSelect;

/** Minimal dependencies shared by local workspace mutation helpers. */
export interface WorkspaceStoreContext {
	db: HostDb;
	eventBus: EventBus;
	clientMachineId?: string;
}

/**
 * The workspace row shape the host serves: the frozen cloud column set,
 * kept so consumers written against the old cloud rows keep working now
 * that the host answers from its own table.
 */
export interface CloudShapedWorkspace {
	id: string;
	/** Null for project-less "session" workspaces. */
	projectId: string | null;
	hostId: string;
	name: string;
	branch: string;
	type: "main" | "worktree" | "session";
	createdByUserId: string | null;
	taskId: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export function toWorkspaceSnapshot(
	row: HostWorkspaceRow,
	tags: string[],
): WorkspaceSnapshot {
	return {
		id: row.id,
		projectId: row.projectId,
		name: row.name || row.branch,
		branch: row.branch,
		type: row.type,
		worktreePath: row.worktreePath,
		taskId: row.taskId,
		createdByUserId: row.createdByUserId,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt || row.createdAt,
		tags,
	};
}

/** A workspace's tags, already-normalized in storage, read back sorted. */
export function getWorkspaceTags(db: HostDb, workspaceId: string): string[] {
	return db
		.select({ tag: workspaceTags.tag })
		.from(workspaceTags)
		.where(eq(workspaceTags.workspaceId, workspaceId))
		.all()
		.map((row) => row.tag)
		.sort();
}

/** Batch tag lookup for list responses; ids absent from the map have none. */
export function getWorkspaceTagsByWorkspaceId(
	db: HostDb,
	workspaceIds: string[],
): Map<string, string[]> {
	const byWorkspace = new Map<string, string[]>();
	if (workspaceIds.length === 0) return byWorkspace;
	const rows = db
		.select({ workspaceId: workspaceTags.workspaceId, tag: workspaceTags.tag })
		.from(workspaceTags)
		.where(inArray(workspaceTags.workspaceId, workspaceIds))
		.all();
	for (const row of rows) {
		const tags = byWorkspace.get(row.workspaceId);
		if (tags) {
			tags.push(row.tag);
		} else {
			byWorkspace.set(row.workspaceId, [row.tag]);
		}
	}
	for (const tags of byWorkspace.values()) tags.sort();
	return byWorkspace;
}

export function toCloudShape(row: HostWorkspaceRow): CloudShapedWorkspace {
	return {
		id: row.id,
		projectId: row.projectId,
		hostId: getHostId(),
		// Rows that predate local ownership have an empty name until the
		// backfill sweep fills it; branch is the honest fallback.
		name: row.name || row.branch,
		branch: row.branch,
		type: row.type,
		createdByUserId: row.createdByUserId,
		taskId: row.taskId,
		createdAt: new Date(row.createdAt),
		updatedAt: new Date(row.updatedAt || row.createdAt),
	};
}

export function getLocalWorkspace(
	db: HostDb,
	id: string,
): HostWorkspaceRow | undefined {
	return db.query.workspaces.findFirst({ where: eq(workspaces.id, id) }).sync();
}

export interface InsertLocalWorkspaceValues {
	id?: string;
	/** Null for project-less "session" workspaces. */
	projectId: string | null;
	worktreePath: string;
	branch: string;
	name: string;
	type?: "main" | "worktree" | "session";
	taskId?: string | null;
	createdByUserId?: string | null;
	tags?: string[];
}

/**
 * Insert a fully-populated local workspace row (host mints the id when the
 * caller didn't) and broadcast `workspace:changed`.
 */
export function insertLocalWorkspace(
	ctx: WorkspaceStoreContext,
	values: InsertLocalWorkspaceValues,
): HostWorkspaceRow {
	const now = Date.now();
	const id = values.id ?? randomUUID();
	const tags = normalizeWorkspaceTags(values.tags);
	ctx.db.transaction((tx) => {
		tx.insert(workspaces)
			.values({
				id,
				projectId: values.projectId,
				worktreePath: values.worktreePath,
				branch: values.branch,
				name: values.name,
				type: values.type ?? "worktree",
				taskId: values.taskId ?? null,
				createdByUserId: values.createdByUserId ?? null,
				createdAt: now,
				updatedAt: now,
			})
			.run();
		if (tags.length > 0) {
			tx.insert(workspaceTags)
				.values(tags.map((tag) => ({ workspaceId: id, tag, createdAt: now })))
				.run();
		}
	});
	const row = getLocalWorkspace(ctx.db, id);
	if (!row) throw new Error(`Workspace insert readback failed: ${id}`);
	emitWorkspaceChanged(ctx, "created", row);
	return row;
}

export interface UpdateLocalWorkspacePatch {
	name?: string;
	branch?: string;
	worktreePath?: string;
	taskId?: string | null;
	projectId?: string;
	/** Full replacement of the tag set; already-normalized by the caller. */
	tags?: string[];
}

/** Patch a local row, bump `updatedAt`, and broadcast. */
export function updateLocalWorkspace(
	ctx: WorkspaceStoreContext,
	id: string,
	patch: UpdateLocalWorkspacePatch,
): HostWorkspaceRow | undefined {
	const existing = getLocalWorkspace(ctx.db, id);
	if (!existing) return undefined;
	const { tags, ...columns } = patch;
	const normalizedTags =
		tags === undefined ? undefined : normalizeWorkspaceTags(tags);
	// Tag replacement is delete-then-insert; the transaction keeps a throw
	// between them from losing the whole set.
	ctx.db.transaction((tx) => {
		tx.update(workspaces)
			.set({
				...columns,
				updatedAt: Date.now(),
			})
			.where(eq(workspaces.id, id))
			.run();
		if (normalizedTags !== undefined) {
			tx.delete(workspaceTags).where(eq(workspaceTags.workspaceId, id)).run();
			if (normalizedTags.length > 0) {
				const now = Date.now();
				tx.insert(workspaceTags)
					.values(
						normalizedTags.map((tag) => ({
							workspaceId: id,
							tag,
							createdAt: now,
						})),
					)
					.run();
			}
		}
	});
	const row = getLocalWorkspace(ctx.db, id);
	if (row) emitWorkspaceChanged(ctx, "updated", row);
	return row;
}

/** Hard-delete a local row and broadcast. Idempotent. The destroy pipeline
 * archives via `archiveLocalWorkspace` instead — this remains only for
 * phantom-row cleanup (adopt-existing-worktree conflicts). */
export function deleteLocalWorkspace(
	ctx: WorkspaceStoreContext,
	id: string,
): void {
	const existing = getLocalWorkspace(ctx.db, id);
	ctx.db.delete(workspaces).where(eq(workspaces.id, id)).run();
	if (existing) {
		ctx.eventBus.broadcastWorkspaceChanged({
			workspaceId: id,
			eventType: "deleted",
			workspace: null,
			occurredAt: Date.now(),
		});
	}
}

/**
 * Tombstone a local row instead of deleting it. Broadcasts the same
 * `deleted` event shape as a hard delete so every existing consumer drops
 * the row identically; the row itself survives for the board's
 * Merged/Deleted history. Idempotent — re-archiving keeps the original
 * timestamp and reason.
 */
export function archiveLocalWorkspace(
	ctx: WorkspaceStoreContext,
	id: string,
	reason: "merged" | "deleted",
): void {
	const existing = getLocalWorkspace(ctx.db, id);
	if (!existing) return;
	if (existing.archivedAt == null) {
		ctx.db
			.update(workspaces)
			.set({
				archivedAt: Date.now(),
				archiveReason: reason,
				updatedAt: Date.now(),
			})
			.where(eq(workspaces.id, id))
			.run();
	}
	ctx.eventBus.broadcastWorkspaceChanged({
		workspaceId: id,
		eventType: "deleted",
		workspace: null,
		occurredAt: Date.now(),
	});
	// Physical cleanup completes in the workspace-cleanup pipeline.
}

/**
 * Revive a tombstoned row — the destroy pipeline failed after the
 * mark-first commit, so the workspace is live and retryable again.
 * Broadcasts `created` so list patchers that dropped the row on the
 * archive event re-add it. Idempotent.
 */
export function unarchiveLocalWorkspace(
	ctx: WorkspaceStoreContext,
	id: string,
): void {
	const existing = getLocalWorkspace(ctx.db, id);
	if (!existing) return;
	if (existing.archivedAt != null) {
		ctx.db
			.update(workspaces)
			.set({ archivedAt: null, archiveReason: null, updatedAt: Date.now() })
			.where(eq(workspaces.id, id))
			.run();
	}
	const row = getLocalWorkspace(ctx.db, id);
	if (row) emitWorkspaceChanged(ctx, "created", row);
}

function emitWorkspaceChanged(
	ctx: Pick<WorkspaceStoreContext, "db" | "eventBus">,
	eventType: "created" | "updated",
	row: HostWorkspaceRow,
): void {
	ctx.eventBus.broadcastWorkspaceChanged({
		workspaceId: row.id,
		eventType,
		workspace: toWorkspaceSnapshot(row, getWorkspaceTags(ctx.db, row.id)),
		occurredAt: Date.now(),
	});
}
