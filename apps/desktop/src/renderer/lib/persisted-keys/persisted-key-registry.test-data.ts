/**
 * Allowlist of renderer localStorage writers and their live key families.
 * CI fails on unregistered or stale writer files. `*` marks a dynamic part.
 * Bounds and deletion requirements live in apps/desktop/AGENTS.md.
 */
export const PERSISTED_KEY_REGISTRY: ReadonlyArray<
	readonly [file: string, keys: readonly string[]]
> = [
	[
		"src/renderer/components/usage-reporter/usage-reporter.tsx",
		["choros:last-authenticated-user-id", "choros:usage-launch:*"],
	],
	["src/renderer/lib/onboarding-state.ts", ["choros:onboarding-complete-v1"]],
	[
		"src/renderer/routes/_authenticated/providers/collections-provider/collections.ts",
		[
			"v2-workspace-local-state-*",
			"v2-sidebar-projects-*",
			"v2-sidebar-sections-*",
			"v2-terminal-presets-*",
			"v2-user-preferences-*",
			"failed-workspace-creates-*",
		],
	],
	[
		"src/renderer/routes/_authenticated/providers/collections-provider/with-quota-guard.ts",
		[],
	],
	[
		"src/renderer/lib/terminal/terminal-runtime.ts",
		["terminal-buffer:*", "terminal-dims:*"],
	],
	["src/renderer/lib/terminal/terminal-seq-anchor.ts", ["terminal-seq:*"]],
	[
		"src/renderer/lib/terminal/terminal-buffer-gc.ts",
		["terminal-buffer-persisted-at"],
	],
	[
		"src/renderer/lib/trpc-storage.ts",
		["<store>:version", "<store>:pending", "<store>:pending:updatedAt"],
	],
	[
		"src/renderer/lib/persistent-hash-history/persistent-hash-history.ts",
		["router-history"],
	],
	[
		"src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/state/pane-scroll-state-cache/pane-scroll-state-cache.ts",
		["v2-pane-scroll-state-v1"],
	],
	[
		"src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/use-pane-registry/components/chat-v3-pane/components/composer/composer.tsx",
		["chat-v3-draft:*"],
	],
	["src/renderer/stores/changes/store.ts", ["changes-store"]],
	["src/renderer/stores/prompt-history.ts", ["prompt-history"]],
	[
		"src/renderer/stores/theme/store.ts",
		["theme-storage", "theme-terminal", "theme-id", "theme-type"],
	],
	["src/renderer/stores/ringtone/store.ts", ["ringtone-storage"]],
	["src/renderer/stores/settings.ts", ["settings"]],
	[
		"src/renderer/stores/markdown-preferences/store.ts",
		["markdown-preferences"],
	],
	["src/renderer/stores/file-explorer.ts", ["file-explorer-store"]],
	["src/renderer/stores/ports/store.ts", ["ports-store"]],
	["src/renderer/stores/search-dialog-state.ts", ["search-dialog-store"]],
	["src/renderer/stores/sidebar-state.ts", ["sidebar-store"]],
	["src/renderer/stores/new-workspace-width.ts", ["new-workspace-width"]],
	[
		"src/renderer/stores/workspace-sidebar-state.ts",
		["workspace-sidebar-store"],
	],
	[
		"src/renderer/stores/sidebar-sections-collapse.ts",
		["sidebar-workspaces-collapse"],
	],
	[
		"src/renderer/stores/last-active-v2-workspace.ts",
		["last-active-v2-workspace"],
	],
	[
		"src/renderer/stores/v2-workspace-create-defaults.ts",
		["v2-workspace-create-defaults"],
	],
	["src/renderer/stores/v2-project-local-meta.ts", ["v2-project-local-meta"]],
	[
		"src/renderer/stores/v2-changes-sections/store.ts",
		["v2-changes-sections-v1"],
	],
	["src/renderer/stores/v2-notifications/store.ts", ["v2-notifications-v1"]],
	["src/renderer/stores/hiring-banner/store.ts", ["hiring-banner-v1"]],
	["src/renderer/stores/star-nag/store.ts", ["star-nag-v1"]],
	[
		"src/renderer/stores/terminal-close-confirm/store.ts",
		["terminal-close-confirm-v1"],
	],
	[
		"src/renderer/stores/app-version-history/store.ts",
		["app-version-history-v1"],
	],
	[
		"src/renderer/stores/create-dismissals-store/create-dismissals-store.ts",
		[
			"desktop-notice-dismissals-v1",
			"v2-setup-card-dismissals-v1",
			"browser-import-banner-dismissals-v1",
		],
	],
	["src/renderer/stores/workspace-agents-row.ts", ["workspace-agents-row"]],
	[
		"src/renderer/routes/_authenticated/settings/usage/utils/usage-last-section/usage-last-section.ts",
		["usage-last-section-v1"],
	],
	["src/renderer/stores/inline-workspace-ports.ts", ["inline-workspace-ports"]],
	[
		"src/renderer/hotkeys/stores/hotkey-overrides-store.ts",
		["hotkey-overrides"],
	],
	[
		"src/renderer/hotkeys/stores/keyboard-preferences-store.ts",
		["keyboard-preferences"],
	],
	[
		"src/renderer/routes/_authenticated/_dashboard/pull-requests/stores/pull-requests-filter-store/pull-requests-filter-store.ts",
		["pull-requests-filter-state"],
	],
	[
		"src/renderer/routes/_authenticated/_dashboard/pull-requests/stores/pull-requests-split-view-store/pull-requests-split-view-store.ts",
		["pull-requests-split-view-state"],
	],
	[
		"src/renderer/hooks/use-agent-model-preference/use-agent-model-preference.ts",
		["lastSelectedV2WorkspaceCreateModelByPreset"],
	],
	[
		"src/renderer/hooks/use-agent-effort-preference/use-agent-effort-preference.ts",
		["lastSelectedV2WorkspaceCreateEffortByPreset"],
	],
	[
		"src/renderer/hooks/use-agent-mode-preference/use-agent-mode-preference.ts",
		["lastSelectedV2WorkspaceCreateModeByPreset"],
	],
	[
		"src/renderer/hooks/use-agent-launch-preferences/use-agent-launch-preferences.ts",
		[
			"lastSelectedV2WorkspaceCreateAgent",
			"lastOpenedInProjectId",
			"lastSelectedAgent",
			"agentAutoRun",
		],
	],
	["src/renderer/routes/_authenticated/layout.tsx", ["lastViewedWorkspaceId"]],
	[
		"src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/use-pane-registry/components/terminal-pane/rich-input-open-store.ts",
		["choros.terminalRichInputOpen"],
	],
	[
		"src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/use-pane-registry/components/agent-comment-composer/hooks/use-diff-comment-target/use-diff-comment-target.ts",
		[
			"lastSelectedDiffCommentNewAgentConfigId",
			"lastSelectedDiffCommentPlacement",
		],
	],
	[
		"src/renderer/routes/_authenticated/components/daemon-auto-update-failure-dialog/daemon-auto-update-failure-dialog.tsx",
		["daemon-update-dismissed-failure-*"],
	],
	[
		"src/renderer/routes/_authenticated/hooks/use-dev-seed-v2-sidebar/use-dev-seed-v2-sidebar.ts",
		["choros:dev:v2-sidebar-seeded"],
	],
	["src/renderer/routes/sign-in/page.tsx", ["choros-last-auth-method"]],
];
