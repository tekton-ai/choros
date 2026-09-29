import type {
	AgentDefinitionId,
	AgentIdentityId,
} from "@choros/shared/agent-catalog";
import type { BranchPrefixMode } from "@choros/shared/workspace-launch";
import { sql } from "drizzle-orm";
import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const terminalSessions = sqliteTable(
	"terminal_sessions",
	{
		id: text().primaryKey(),
		originWorkspaceId: text("origin_workspace_id").references(
			() => workspaces.id,
			{ onDelete: "set null" },
		),
		status: text().notNull().default("active"),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		lastAttachedAt: integer("last_attached_at"),
		endedAt: integer("ended_at"),
		/**
		 * Set the moment a dispose is requested — durable intent-to-kill. A
		 * failed kill leaves the row `active` with this stamp, and the reaper
		 * retries it regardless of workspace liveness (a one-shot renderer
		 * broadcast must not be the only chance to kill a session).
		 */
		disposeRequestedAt: integer("dispose_requested_at"),
	},
	(table) => [
		index("terminal_sessions_origin_workspace_id_idx").on(
			table.originWorkspaceId,
		),
		index("terminal_sessions_status_idx").on(table.status),
	],
);

export const terminalAgentBindings = sqliteTable(
	"terminal_agent_bindings",
	{
		terminalId: text("terminal_id")
			.primaryKey()
			.references(() => terminalSessions.id, { onDelete: "cascade" }),
		workspaceId: text("workspace_id").notNull(),
		agentId: text("agent_id").notNull().$type<AgentIdentityId>(),
		agentSessionId: text("agent_session_id"),
		definitionId: text("definition_id").$type<AgentDefinitionId>(),
		startedAt: integer("started_at").notNull(),
		lastEventAt: integer("last_event_at").notNull(),
		lastEventType: text("last_event_type").notNull(),
		// Set when the agent session ended. "detached" = the agent reported its
		// own end (SessionEnd hook) — not resumable; "terminal-exited" = the
		// terminal died under it (kill, crash, reboot) — resume candidate;
		// "resumed" = the candidate was consumed by an auto-resume; "disposed"
		// = deliberately killed (pane close, CLI kill) — never resumable.
		endedAt: integer("ended_at"),
		endReason: text("end_reason"),
	},
	(table) => [
		index("terminal_agent_bindings_workspace_id_idx").on(table.workspaceId),
	],
);

export const projects = sqliteTable(
	"projects",
	{
		id: text().primaryKey(),
		repoPath: text("repo_path").notNull(),
		repoProvider: text("repo_provider"),
		repoOwner: text("repo_owner"),
		repoName: text("repo_name"),
		repoUrl: text("repo_url"),
		remoteName: text("remote_name"),
		worktreeBaseDir: text("worktree_base_dir"),
		// Per-project branch-prefix override. A null `branchPrefixMode` means
		// "fall back to the host-wide default" in `host_settings`.
		branchPrefixMode: text("branch_prefix_mode").$type<BranchPrefixMode>(),
		branchPrefixCustom: text("branch_prefix_custom"),
		// Custom project icon as a small downscaled data-URI. Null falls back to
		// the GitHub owner avatar (when a repo is linked) or a placeholder.
		icon: text("icon"),
		// Accent color as a `#rrggbb` hex. Null means the default (no accent).
		color: text("color"),
		// JSON array of repo-relative folders to cone-mode sparse-checkout into
		// new worktrees. Null (the default) means a full checkout. Read through
		// `parseSparseCheckoutPaths` — the encoding is not part of the API.
		sparseCheckoutPaths: text("sparse_checkout_paths"),
		// Free-text instructions injected into AI workspace/branch naming for
		// this project (e.g. "include the Linear ticket id in the branch name").
		// Null means the default naming behavior.
		namingInstructions: text("naming_instructions"),
		// Empty string means "not yet backfilled" — the startup sweep targets
		// these rows (name from cloud legacy row if reachable, else basename).
		name: text().notNull().default(""),
		// 0 means "predates local ownership"; write paths always set it.
		updatedAt: integer("updated_at").notNull().default(0),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [index("projects_repo_path_idx").on(table.repoPath)],
);

/**
 * Single-row host-wide settings (always `id = 1`). The host-service has no
 * generic settings store yet; this row holds host-wide knobs (worktree base
 * dir, branch-prefix default) that projects fall back to when they have no
 * override of their own.
 */
export const hostSettings = sqliteTable("host_settings", {
	id: integer().primaryKey().default(1),
	worktreeBaseDir: text("worktree_base_dir"),
	branchPrefixMode: text("branch_prefix_mode").$type<BranchPrefixMode>(),
	branchPrefixCustom: text("branch_prefix_custom"),
	// Which provider login newly launched agents use, as the profile dir to
	// inject (CLAUDE_CONFIG_DIR / CODEX_HOME). Null = the system default login.
	defaultClaudeConfigDir: text("default_claude_config_dir"),
	defaultCodexHome: text("default_codex_home"),
});

export const pullRequests = sqliteTable(
	"pull_requests",
	{
		id: text().primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		repoProvider: text("repo_provider").notNull(),
		repoOwner: text("repo_owner").notNull(),
		repoName: text("repo_name").notNull(),
		prNumber: integer("pr_number").notNull(),
		url: text().notNull(),
		title: text().notNull(),
		state: text().notNull(),
		isDraft: integer("is_draft", { mode: "boolean" }).notNull().default(false),
		headBranch: text("head_branch").notNull(),
		headSha: text("head_sha").notNull(),
		reviewDecision: text("review_decision"),
		checksStatus: text("checks_status").notNull().default("none"),
		checksJson: text("checks_json").notNull().default("[]"),
		// Set when the PR is first observed merged; never cleared. Anchors
		// "merged in the last N days" windows on the workspaces board.
		mergedAt: integer("merged_at"),
		lastFetchedAt: integer("last_fetched_at"),
		error: text(),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		index("pull_requests_project_id_idx").on(table.projectId),
		index("pull_requests_repo_branch_idx").on(
			table.repoProvider,
			table.repoOwner,
			table.repoName,
			table.headBranch,
		),
		uniqueIndex("pull_requests_repo_pr_unique").on(
			table.repoProvider,
			table.repoOwner,
			table.repoName,
			table.prNumber,
		),
	],
);

export const hostAgentConfigs = sqliteTable(
	"host_agent_configs",
	{
		id: text().primaryKey(),
		presetId: text("preset_id").notNull(),
		// Optional icon override. When null the client falls back to the icon
		// implied by `presetId`. User-authored ("custom") agents set this to a
		// built-in icon key (e.g. "claude") to pick a recognizable icon.
		iconId: text("icon_id"),
		label: text().notNull(),
		command: text().notNull(),
		argsJson: text("args_json").notNull().default("[]"),
		promptTransport: text("prompt_transport").notNull(),
		promptArgsJson: text("prompt_args_json").notNull().default("[]"),
		// Args that resume a previous session; the session id is appended after
		// them. Empty means the agent has no id-based resume.
		resumeArgsJson: text("resume_args_json").notNull().default("[]"),
		// Args that fork a previous session into a new provider session id.
		forkArgsJson: text("fork_args_json").notNull().default("[]"),
		envJson: text("env_json").notNull().default("{}"),
		displayOrder: integer("display_order").notNull(),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		index("host_agent_configs_display_order_idx").on(table.displayOrder),
	],
);

export const workspaces = sqliteTable(
	"workspaces",
	{
		id: text().primaryKey(),
		// Null = a project-less "session" workspace (managed folder under
		// ~/.choros/sessions, its own standalone git repo).
		projectId: text("project_id").references(() => projects.id, {
			onDelete: "cascade",
		}),
		worktreePath: text("worktree_path").notNull(),
		branch: text().notNull(),
		headSha: text("head_sha"),
		upstreamOwner: text("upstream_owner"),
		upstreamRepo: text("upstream_repo"),
		upstreamBranch: text("upstream_branch"),
		pullRequestId: text("pull_request_id").references(() => pullRequests.id, {
			onDelete: "set null",
		}),
		// Set when the user removes the PR link; the refresh sweep must not
		// re-link this specific PR. A different PR on the branch still links.
		suppressedPullRequestId: text("suppressed_pull_request_id").references(
			() => pullRequests.id,
			{ onDelete: "set null" },
		),
		// Empty string means "not yet backfilled from cloud" — the startup
		// backfill sweep targets these rows.
		name: text().notNull().default(""),
		type: text()
			.$type<"main" | "worktree" | "session">()
			.notNull()
			.default("worktree"),
		taskId: text("task_id"),
		createdByUserId: text("created_by_user_id"),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		// 0 means "predates local ownership"; write paths always set it.
		updatedAt: integer("updated_at").notNull().default(0),
		// Null = local changes not yet pushed to the cloud mirror (dual-write
		// era only; the column and reconciler go away in R3).
		// Tombstone: null = live. Set at the destroy commit point; rows are
		// kept forever and surface on the board's Merged/Deleted columns.
		archivedAt: integer("archived_at"),
		// "merged" when the linked PR was merged at destroy time.
		archiveReason: text("archive_reason").$type<"merged" | "deleted">(),
	},
	(table) => [
		index("workspaces_project_id_idx").on(table.projectId),
		index("workspaces_archived_at_idx").on(table.archivedAt),
		index("workspaces_upstream_ref_idx").on(
			table.upstreamOwner,
			table.upstreamRepo,
			table.upstreamBranch,
		),
		index("workspaces_pull_request_id_idx").on(table.pullRequestId),
		uniqueIndex("workspaces_one_main_per_project")
			.on(table.projectId)
			.where(sql`type = 'main'`),
	],
);

/**
 * Presentation for a tag folder, host-side so it follows the user across
 * devices: a row exists only once someone customises the folder (same
 * lifecycle as the old local row). `tag` stays the stable slug agents
 * target; `display_name` is what the sidebar shows — which is what makes
 * rename a one-row update instead of retagging every member.
 */
export const workspaceTagSettings = sqliteTable(
	"workspace_tag_settings",
	{
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		tag: text().notNull(),
		displayName: text("display_name"),
		color: text(),
		tabOrder: integer("tab_order"),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [primaryKey({ columns: [table.projectId, table.tag] })],
);

/**
 * Plain-string tags on workspaces — no tag entity, no tag ids. `tag` is
 * stored already-normalized (trimmed + lowercased, see
 * `@choros/shared/workspace-tags`); sidebar folders derive from these
 * rows, so any actor that can tag a workspace can file it.
 */
export const workspaceTags = sqliteTable(
	"workspace_tags",
	{
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		tag: text().notNull(),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		primaryKey({ columns: [table.workspaceId, table.tag] }),
		index("workspace_tags_tag_idx").on(table.tag),
	],
);

/**
 * Every pull request a workspace has ever been linked to, append-only.
 * `workspaces.pullRequestId` stays the single "currently linked" pointer the
 * sidebar shows (and Remove PR Link clears); this table is the memory that
 * survives the pointer moving on — a workspace that opens a PR per branch
 * accumulates one row each. Unlinking hides a PR from the sidebar, never
 * from here.
 */
export const workspacePullRequests = sqliteTable(
	"workspace_pull_requests",
	{
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		pullRequestId: text("pull_request_id")
			.notNull()
			.references(() => pullRequests.id, { onDelete: "cascade" }),
		linkedAt: integer("linked_at").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.workspaceId, table.pullRequestId] }),
		index("workspace_pull_requests_workspace_idx").on(table.workspaceId),
	],
);

export const automations = sqliteTable(
	"automations",
	{
		id: text().primaryKey(),
		currentRevision: integer("current_revision").notNull(),
		version: integer().notNull(),
		state: text().notNull(),
		nextDueAt: integer("next_due_at"),
		scheduleCursor: integer("schedule_cursor"),
		usedRounds: integer("used_rounds").notNull().default(0),
		resumeAt: integer("resume_at"),
		lastFinishedAt: integer("last_finished_at"),
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => [
		index("automations_state_due_idx").on(table.state, table.nextDueAt),
		index("automations_updated_idx").on(table.updatedAt, table.id),
	],
);

export const automationVersions = sqliteTable(
	"automation_versions",
	{
		automationId: text("automation_id")
			.notNull()
			.references(() => automations.id, { onDelete: "cascade" }),
		revision: integer().notNull(),
		definition: text().notNull(),
		createdAt: integer("created_at").notNull(),
	},
	(table) => [primaryKey({ columns: [table.automationId, table.revision] })],
);

export const automationRuns = sqliteTable(
	"automation_runs",
	{
		id: text().primaryKey(),
		automationId: text("automation_id")
			.notNull()
			.references(() => automations.id, { onDelete: "cascade" }),
		definitionRevision: integer("definition_revision").notNull(),
		source: text().notNull(),
		plannedAt: integer("planned_at"),
		occurrenceKey: text("occurrence_key"),
		status: text().notNull(),
		reason: text(),
		executionId: text("execution_id"),
		retryOf: text("retry_of"),
		createdAt: integer("created_at").notNull(),
		startedAt: integer("started_at"),
		finishedAt: integer("finished_at"),
	},
	(table) => [
		uniqueIndex("automation_runs_occurrence_uq").on(
			table.automationId,
			table.occurrenceKey,
		),
		uniqueIndex("automation_runs_planned_at_uq").on(
			table.automationId,
			table.plannedAt,
		),
		uniqueIndex("automation_runs_execution_uq").on(table.executionId),
		index("automation_runs_history_idx").on(
			table.automationId,
			table.createdAt,
			table.id,
		),
		index("automation_runs_status_idx").on(table.status, table.createdAt),
	],
);

export const executionRuns = sqliteTable(
	"execution_runs",
	{
		id: text().primaryKey(),
		runId: text("run_id")
			.notNull()
			.references(() => automationRuns.id, { onDelete: "cascade" }),
		automationId: text("automation_id")
			.notNull()
			.references(() => automations.id, { onDelete: "cascade" }),
		definitionRevision: integer("definition_revision").notNull(),
		status: text().notNull(),
		stage: text().notNull(),
		workspaceId: text("workspace_id"),
		automationOccupancy: text("automation_occupancy"),
		workspaceOccupancy: text("workspace_occupancy"),
		chatSessionId: text("chat_session_id"),
		providerSessionId: text("provider_session_id"),
		report: text(),
		preparationEvidence: text("preparation_evidence"),
		cancelRequestedAt: integer("cancel_requested_at"),
		createdAt: integer("created_at").notNull(),
		startedAt: integer("started_at"),
		finishedAt: integer("finished_at"),
	},
	(table) => [
		uniqueIndex("execution_runs_run_uq").on(table.runId),
		uniqueIndex("execution_runs_automation_occupancy_uq").on(
			table.automationOccupancy,
		),
		uniqueIndex("execution_runs_workspace_occupancy_uq").on(
			table.workspaceOccupancy,
		),
		index("execution_runs_status_idx").on(table.status, table.createdAt),
	],
);

export const executionOperations = sqliteTable(
	"execution_operations",
	{
		id: text().primaryKey(),
		executionId: text("execution_id")
			.notNull()
			.references(() => executionRuns.id, { onDelete: "cascade" }),
		kind: text().notNull(),
		state: text().notNull(),
		parameterDigest: text("parameter_digest").notNull(),
		receipt: text(),
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("execution_operations_kind_uq").on(
			table.executionId,
			table.kind,
		),
		index("execution_operations_state_idx").on(table.state, table.updatedAt),
	],
);

export const executionInputs = sqliteTable(
	"execution_inputs",
	{
		id: text().primaryKey(),
		executionId: text("execution_id")
			.notNull()
			.references(() => executionRuns.id, { onDelete: "cascade" }),
		kind: text().notNull(),
		question: text().notNull(),
		options: text(),
		status: text().notNull(),
		version: integer().notNull(),
		answer: text(),
		deliveryState: text("delivery_state"),
		createdAt: integer("created_at").notNull(),
		answeredAt: integer("answered_at"),
	},
	(table) => [
		index("execution_inputs_pending_idx").on(table.status, table.createdAt),
	],
);

export const workCommandReceipts = sqliteTable(
	"work_command_receipts",
	{
		scope: text().notNull(),
		requestId: text("request_id").notNull(),
		parameterDigest: text("parameter_digest").notNull(),
		confirmationDigest: text("confirmation_digest"),
		result: text().notNull(),
		createdAt: integer("created_at").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.scope, table.requestId] }),
		uniqueIndex("work_command_confirmation_uq").on(table.confirmationDigest),
	],
);

export const workEvents = sqliteTable(
	"work_events",
	{
		seq: integer().primaryKey({ autoIncrement: true }),
		automationId: text("automation_id"),
		runId: text("run_id"),
		type: text().notNull(),
		createdAt: integer("created_at").notNull(),
	},
	(table) => [
		index("work_events_automation_idx").on(table.automationId, table.seq),
		index("work_events_run_idx").on(table.runId, table.seq),
	],
);
