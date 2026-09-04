import type { InstalledPlugin } from "@choros/shared/plugins";
import {
	index,
	integer,
	real,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";
import { v4 as uuidv4 } from "uuid";

import type {
	AgentCustomDefinition,
	AgentPresetOverrideEnvelope,
	ExternalApp,
	FileOpenMode,
	TerminalLinkBehavior,
	TerminalPreset,
} from "./zod";

export const settings = sqliteTable("settings", {
	id: integer("id").primaryKey().default(1),
	terminalPresets: text("terminal_presets", { mode: "json" }).$type<
		TerminalPreset[]
	>(),
	terminalPresetsInitialized: integer("terminal_presets_initialized", {
		mode: "boolean",
	}),
	agentPresetOverrides: text("agent_preset_overrides", {
		mode: "json",
	}).$type<AgentPresetOverrideEnvelope>(),
	agentCustomDefinitions: text("agent_custom_definitions", {
		mode: "json",
	}).$type<AgentCustomDefinition[]>(),
	agentPresetPermissionsMigratedAt: integer(
		"agent_preset_permissions_migrated_at",
	),
	selectedRingtoneId: text("selected_ringtone_id"),
	// App display language: "auto" or a supported BCP 47 tag; null = auto.
	language: text("language"),
	confirmOnQuit: integer("confirm_on_quit", { mode: "boolean" }),
	terminalLinkBehavior: text(
		"terminal_link_behavior",
	).$type<TerminalLinkBehavior>(),
	waitForSetupBeforeAgent: integer("wait_for_setup_before_agent", {
		mode: "boolean",
	}),
	notificationSoundsMuted: integer("notification_sounds_muted", {
		mode: "boolean",
	}),
	notificationVolume: integer("notification_volume"),
	fileOpenMode: text("file_open_mode").$type<FileOpenMode>(),
	terminalFontFamily: text("terminal_font_family"),
	terminalFontSize: integer("terminal_font_size"),
	terminalLineHeight: real("terminal_line_height"),
	terminalLetterSpacing: real("terminal_letter_spacing"),
	terminalFontWeight: integer("terminal_font_weight"),
	terminalLigatures: integer("terminal_ligatures", { mode: "boolean" }),
	terminalMinimumContrast: real("terminal_minimum_contrast"),
	terminalCursorStyle: text("terminal_cursor_style").$type<
		"block" | "bar" | "underline"
	>(),
	terminalCursorBlink: integer("terminal_cursor_blink", { mode: "boolean" }),
	terminalParkedRuntimeCap: integer("terminal_parked_runtime_cap"),
	terminalCopyOnSelect: integer("terminal_copy_on_select", {
		mode: "boolean",
	}),
	editorFontFamily: text("editor_font_family"),
	editorFontSize: integer("editor_font_size"),
	editorLineHeight: real("editor_line_height"),
	editorLetterSpacing: real("editor_letter_spacing"),
	editorFontWeight: integer("editor_font_weight"),
	editorLigatures: integer("editor_ligatures", { mode: "boolean" }),
	showResourceMonitor: integer("show_resource_monitor", { mode: "boolean" }),
	browserHomepageUrl: text("browser_homepage_url"),
	defaultEditor: text("default_editor").$type<ExternalApp>(),
	disabledAgentHooks: text("disabled_agent_hooks", { mode: "json" }).$type<
		string[]
	>(),
	installedPlugins: text("installed_plugins", { mode: "json" }).$type<
		InstalledPlugin[]
	>(),
	disabledSkills: text("disabled_skills", { mode: "json" }).$type<string[]>(),
});

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
