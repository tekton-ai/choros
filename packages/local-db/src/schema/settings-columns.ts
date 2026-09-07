import type { InstalledPlugin } from "@choros/shared/plugins";
import { integer, real, text } from "drizzle-orm/sqlite-core";
import type {
	AgentCustomDefinition,
	AgentPresetOverrideEnvelope,
	ExternalApp,
	FileOpenMode,
	TerminalLinkBehavior,
	TerminalPreset,
} from "./zod";

/** Shared builders keep generation-only retained columns out of runtime types. */
export function createSettingsColumns() {
	return {
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
	};
}
