// Migration-only schema: retain pre-removal tables and columns for additive upgrades.
// Never export this module from the local-db runtime package. Removing old product
// code did not authorize deleting its persisted data (baseline: migration 0054).
import {
	foreignKey,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { createSettingsColumns } from "./schema/settings-columns";

export * from "./schema/schema";

export const settings = sqliteTable("settings", {
	...createSettingsColumns(),
	last_active_workspace_id: text("last_active_workspace_id"),
	active_organization_id: text("active_organization_id"),
	persist_terminal: integer("persist_terminal", { mode: "boolean" }).default(
		true,
	),
	auto_apply_default_preset: integer("auto_apply_default_preset"),
	branch_prefix_mode: text("branch_prefix_mode"),
	branch_prefix_custom: text("branch_prefix_custom"),
	delete_local_branch: integer("delete_local_branch"),
	show_presets_bar: integer("show_presets_bar"),
	use_compact_terminal_add_button: integer("use_compact_terminal_add_button"),
	worktree_base_dir: text("worktree_base_dir"),
	open_links_in_app: integer("open_links_in_app"),
	expose_host_service_via_relay: integer("expose_host_service_via_relay"),
});

export const users = sqliteTable(
	"users",
	{
		id: text("id").primaryKey(),
		clerk_id: text("clerk_id").notNull(),
		name: text("name").notNull(),
		email: text("email").notNull(),
		avatar_url: text("avatar_url"),
		deleted_at: text("deleted_at"),
		created_at: text("created_at").notNull(),
		updated_at: text("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("users_clerk_id_unique").on(table.clerk_id),
		uniqueIndex("users_email_unique").on(table.email),
		index("users_email_idx").on(table.email),
		index("users_clerk_id_idx").on(table.clerk_id),
	],
);

export const organizations = sqliteTable(
	"organizations",
	{
		id: text("id").primaryKey(),
		clerk_org_id: text("clerk_org_id"),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		github_org: text("github_org"),
		avatar_url: text("avatar_url"),
		created_at: text("created_at").notNull(),
		updated_at: text("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("organizations_clerk_org_id_unique").on(table.clerk_org_id),
		uniqueIndex("organizations_slug_unique").on(table.slug),
		index("organizations_slug_idx").on(table.slug),
		index("organizations_clerk_org_id_idx").on(table.clerk_org_id),
	],
);

export const projects = sqliteTable(
	"projects",
	{
		id: text("id").primaryKey(),
		main_repo_path: text("main_repo_path").notNull(),
		name: text("name").notNull(),
		color: text("color").notNull(),
		tab_order: integer("tab_order"),
		last_opened_at: integer("last_opened_at").notNull(),
		created_at: integer("created_at").notNull(),
		config_toast_dismissed: integer("config_toast_dismissed"),
		default_branch: text("default_branch"),
		workspace_base_branch: text("workspace_base_branch"),
		github_owner: text("github_owner"),
		branch_prefix_mode: text("branch_prefix_mode"),
		branch_prefix_custom: text("branch_prefix_custom"),
		worktree_base_dir: text("worktree_base_dir"),
		hide_image: integer("hide_image"),
		icon_url: text("icon_url"),
		neon_project_id: text("neon_project_id"),
		default_app: text("default_app"),
	},
	(table) => [
		index("projects_main_repo_path_idx").on(table.main_repo_path),
		index("projects_last_opened_at_idx").on(table.last_opened_at),
	],
);

export const worktrees = sqliteTable(
	"worktrees",
	{
		id: text("id").primaryKey(),
		project_id: text("project_id").notNull(),
		path: text("path").notNull(),
		branch: text("branch").notNull(),
		base_branch: text("base_branch"),
		created_at: integer("created_at").notNull(),
		git_status: text("git_status"),
		github_status: text("github_status"),
		created_by_choros: integer("created_by_choros", { mode: "boolean" })
			.notNull()
			.default(true),
	},
	(table) => [
		index("worktrees_project_id_idx").on(table.project_id),
		index("worktrees_branch_idx").on(table.branch),
		foreignKey({
			name: "worktrees_project_id_projects_id_fk",
			columns: [table.project_id],
			foreignColumns: [projects.id],
		})
			.onDelete("cascade")
			.onUpdate("no action"),
	],
);

export const workspace_sections = sqliteTable(
	"workspace_sections",
	{
		id: text("id").primaryKey(),
		project_id: text("project_id").notNull(),
		name: text("name").notNull(),
		tab_order: integer("tab_order").notNull(),
		is_collapsed: integer("is_collapsed", { mode: "boolean" }).default(false),
		color: text("color"),
		created_at: integer("created_at").notNull(),
	},
	(table) => [
		index("workspace_sections_project_id_idx").on(table.project_id),
		foreignKey({
			name: "workspace_sections_project_id_projects_id_fk",
			columns: [table.project_id],
			foreignColumns: [projects.id],
		})
			.onDelete("cascade")
			.onUpdate("no action"),
	],
);

export const workspaces = sqliteTable(
	"workspaces",
	{
		id: text("id").primaryKey(),
		project_id: text("project_id").notNull(),
		worktree_id: text("worktree_id"),
		type: text("type").notNull(),
		branch: text("branch").notNull(),
		name: text("name").notNull(),
		tab_order: integer("tab_order").notNull(),
		created_at: integer("created_at").notNull(),
		updated_at: integer("updated_at").notNull(),
		last_opened_at: integer("last_opened_at").notNull(),
		is_unread: integer("is_unread", { mode: "boolean" }).default(false),
		is_unnamed: integer("is_unnamed", { mode: "boolean" }).default(false),
		deleting_at: integer("deleting_at"),
		port_base: integer("port_base"),
		section_id: text("section_id"),
	},
	(table) => [
		index("workspaces_project_id_idx").on(table.project_id),
		index("workspaces_worktree_id_idx").on(table.worktree_id),
		index("workspaces_last_opened_at_idx").on(table.last_opened_at),
		index("workspaces_section_id_idx").on(table.section_id),
		foreignKey({
			name: "workspaces_project_id_projects_id_fk",
			columns: [table.project_id],
			foreignColumns: [projects.id],
		})
			.onDelete("cascade")
			.onUpdate("no action"),
		foreignKey({
			name: "workspaces_worktree_id_worktrees_id_fk",
			columns: [table.worktree_id],
			foreignColumns: [worktrees.id],
		})
			.onDelete("cascade")
			.onUpdate("no action"),
		foreignKey({
			name: "workspaces_section_id_workspace_sections_id_fk",
			columns: [table.section_id],
			foreignColumns: [workspace_sections.id],
		})
			.onDelete("set null")
			.onUpdate("no action"),
	],
);

export const organization_members = sqliteTable(
	"organization_members",
	{
		id: text("id").primaryKey(),
		organization_id: text("organization_id").notNull(),
		user_id: text("user_id").notNull(),
		role: text("role").notNull(),
		created_at: text("created_at").notNull(),
	},
	(table) => [
		index("organization_members_organization_id_idx").on(table.organization_id),
		index("organization_members_user_id_idx").on(table.user_id),
		foreignKey({
			name: "organization_members_organization_id_organizations_id_fk",
			columns: [table.organization_id],
			foreignColumns: [organizations.id],
		})
			.onDelete("cascade")
			.onUpdate("no action"),
		foreignKey({
			name: "organization_members_user_id_users_id_fk",
			columns: [table.user_id],
			foreignColumns: [users.id],
		})
			.onDelete("cascade")
			.onUpdate("no action"),
	],
);

export const tasks = sqliteTable(
	"tasks",
	{
		id: text("id").primaryKey(),
		slug: text("slug").notNull(),
		title: text("title").notNull(),
		description: text("description"),
		status: text("status").notNull(),
		status_color: text("status_color"),
		status_type: text("status_type"),
		status_position: integer("status_position"),
		priority: text("priority").notNull(),
		organization_id: text("organization_id").notNull(),
		repository_id: text("repository_id"),
		assignee_id: text("assignee_id"),
		creator_id: text("creator_id").notNull(),
		estimate: integer("estimate"),
		due_date: text("due_date"),
		labels: text("labels"),
		branch: text("branch"),
		pr_url: text("pr_url"),
		external_provider: text("external_provider"),
		external_id: text("external_id"),
		external_key: text("external_key"),
		external_url: text("external_url"),
		last_synced_at: text("last_synced_at"),
		sync_error: text("sync_error"),
		started_at: text("started_at"),
		completed_at: text("completed_at"),
		deleted_at: text("deleted_at"),
		created_at: text("created_at").notNull(),
		updated_at: text("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("tasks_slug_unique").on(table.slug),
		index("tasks_slug_idx").on(table.slug),
		index("tasks_organization_id_idx").on(table.organization_id),
		index("tasks_assignee_id_idx").on(table.assignee_id),
		index("tasks_status_idx").on(table.status),
		index("tasks_created_at_idx").on(table.created_at),
		foreignKey({
			name: "tasks_organization_id_organizations_id_fk",
			columns: [table.organization_id],
			foreignColumns: [organizations.id],
		})
			.onDelete("cascade")
			.onUpdate("no action"),
		foreignKey({
			name: "tasks_assignee_id_users_id_fk",
			columns: [table.assignee_id],
			foreignColumns: [users.id],
		})
			.onDelete("set null")
			.onUpdate("no action"),
		foreignKey({
			name: "tasks_creator_id_users_id_fk",
			columns: [table.creator_id],
			foreignColumns: [users.id],
		})
			.onDelete("cascade")
			.onUpdate("no action"),
	],
);

export const v1_migration_state = sqliteTable(
	"v1_migration_state",
	{
		v1_id: text("v1_id").notNull(),
		kind: text("kind").notNull(),
		v2_id: text("v2_id"),
		organization_id: text("organization_id").notNull(),
		status: text("status").notNull(),
		reason: text("reason"),
		migrated_at: integer("migrated_at").notNull(),
	},
	(table) => [
		index("v1_migration_state_v2_id_idx").on(table.v2_id),
		primaryKey({ columns: [table.organization_id, table.v1_id, table.kind] }),
	],
);
