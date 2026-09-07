import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { v4 as uuidv4 } from "uuid";

import { createSettingsColumns } from "./settings-columns";

export const settings = sqliteTable("settings", createSettingsColumns());

export type InsertSettings = typeof settings.$inferInsert;
export type SelectSettings = typeof settings.$inferSelect;

/**
 * Browser history table - persists browsing history for URL autocomplete
 */
export const browserHistory = sqliteTable(
	"browser_history",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		url: text("url").notNull().unique(),
		title: text("title").notNull().default(""),
		faviconUrl: text("favicon_url"),
		lastVisitedAt: integer("last_visited_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		visitCount: integer("visit_count").notNull().default(1),
	},
	(table) => [
		index("browser_history_url_idx").on(table.url),
		index("browser_history_last_visited_at_idx").on(table.lastVisitedAt),
	],
);

export type InsertBrowserHistory = typeof browserHistory.$inferInsert;
export type SelectBrowserHistory = typeof browserHistory.$inferSelect;

export type DownloadState =
	| "progressing"
	| "completed"
	| "cancelled"
	| "interrupted";

/**
 * Downloads table - tracks files downloaded through the in-app browser pane
 */
export const downloads = sqliteTable(
	"downloads",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		url: text("url").notNull(),
		filename: text("filename").notNull(),
		savePath: text("save_path").notNull(),
		mimeType: text("mime_type"),
		totalBytes: integer("total_bytes"),
		receivedBytes: integer("received_bytes").notNull().default(0),
		state: text("state").notNull().$type<DownloadState>(),
		startedAt: integer("started_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		completedAt: integer("completed_at"),
	},
	(table) => [index("downloads_started_at_idx").on(table.startedAt)],
);

export type InsertDownload = typeof downloads.$inferInsert;
export type SelectDownload = typeof downloads.$inferSelect;

/**
 * Screenshots table - tracks page captures taken from the in-app browser
 * pane's overflow menu. The PNG lives on disk; this row is metadata plus a
 * small thumbnail so a gallery can render without reading every file.
 */
export const screenshots = sqliteTable(
	"screenshots",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		url: text("url").notNull(),
		filename: text("filename").notNull(),
		savePath: text("save_path").notNull(),
		width: integer("width").notNull(),
		height: integer("height").notNull(),
		thumbnail: text("thumbnail").notNull(),
		capturedAt: integer("captured_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [index("screenshots_captured_at_idx").on(table.capturedAt)],
);

export type InsertScreenshot = typeof screenshots.$inferInsert;
export type SelectScreenshot = typeof screenshots.$inferSelect;

export const profiles = sqliteTable(
	"profiles",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		nameKey: text("name_key").notNull(),
		sortOrder: integer("sort_order").notNull(),
		isDefault: integer("is_default", { mode: "boolean" }).notNull(),
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("profiles_name_key_unique").on(table.nameKey),
		uniqueIndex("profiles_default_unique")
			.on(table.isDefault)
			.where(sql`${table.isDefault} = 1`),
		check(
			"profiles_default_identity",
			sql`(${table.isDefault} = 1 AND ${table.id} = 'default') OR (${table.isDefault} = 0 AND ${table.id} <> 'default')`,
		),
		check("profiles_sort_order_valid", sql`${table.sortOrder} >= 0`),
	],
);

export const profileMemberships = sqliteTable(
	"profile_memberships",
	{
		profileId: text("profile_id")
			.notNull()
			.references(() => profiles.id),
		kind: text("kind", { enum: ["project", "session"] }).notNull(),
		projectKey: text("project_key"),
		hostId: text("host_id"),
		workspaceId: text("workspace_id"),
	},
	(table) => [
		uniqueIndex("profile_memberships_project_unique")
			.on(table.projectKey)
			.where(sql`${table.kind} = 'project'`),
		uniqueIndex("profile_memberships_session_unique")
			.on(table.hostId, table.workspaceId)
			.where(sql`${table.kind} = 'session'`),
		index("profile_memberships_profile_idx").on(table.profileId),
		check(
			"profile_memberships_nondefault",
			sql`${table.profileId} <> 'default'`,
		),
		check(
			"profile_memberships_shape",
			sql`(${table.kind} = 'project' AND ${table.projectKey} IS NOT NULL AND length(${table.projectKey}) > 0 AND ${table.hostId} IS NULL AND ${table.workspaceId} IS NULL) OR (${table.kind} = 'session' AND ${table.projectKey} IS NULL AND ${table.hostId} IS NOT NULL AND length(${table.hostId}) > 0 AND ${table.workspaceId} IS NOT NULL AND length(${table.workspaceId}) > 0)`,
		),
	],
);

export const profileWorkspaceVisits = sqliteTable(
	"profile_workspace_visits",
	{
		profileId: text("profile_id")
			.notNull()
			.references(() => profiles.id),
		hostId: text("host_id").notNull(),
		workspaceId: text("workspace_id").notNull(),
		visitedAt: integer("visited_at").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.profileId, table.hostId, table.workspaceId] }),
		index("profile_workspace_visits_recent_idx").on(
			table.profileId,
			table.visitedAt,
		),
		check("profile_workspace_visits_time_valid", sql`${table.visitedAt} >= 0`),
	],
);

export const profileRegistryState = sqliteTable(
	"profile_registry_state",
	{
		id: integer("id").primaryKey(),
		revision: integer("revision").notNull(),
		selectedProfileId: text("selected_profile_id")
			.notNull()
			.references(() => profiles.id),
	},
	(table) => [
		check("profile_registry_state_singleton", sql`${table.id} = 1`),
		check("profile_registry_state_revision_valid", sql`${table.revision} >= 0`),
	],
);
