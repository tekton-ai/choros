import {
	setupSingleAgent,
	teardownSingleAgent,
	writeSharedDisabledAgentIds,
} from "@choros/agent-setup";
import { isSupportedLocale } from "@choros/i18n/locales";
import {
	type AgentCustomDefinition,
	type AgentPresetOverrideEnvelope,
	FILE_OPEN_MODES,
	settings,
	TERMINAL_LINK_BEHAVIORS,
	type TerminalPreset,
} from "@choros/local-db";
import {
	AGENT_PRESET_COMMANDS,
	AGENT_PRESET_DESCRIPTIONS,
	DEFAULT_TERMINAL_PRESET_AGENT_TYPES,
} from "@choros/shared/agent-command";
import {
	applyLegacyPermissionsOverrides,
	terminalPresetsMatchPre3546Seed,
} from "@choros/shared/agent-permissions-migration";
import {
	type AgentDefinitionId,
	applyCustomAgentDefinitionPatch,
	createOverrideEnvelopeWithPatch,
	getAgentDefinitionById,
	getCustomAgentDefinitionById,
	readAgentPresetOverrides,
	resetAgentPresetOverride,
	resolveAgentConfigs,
	upsertCustomAgentDefinition,
} from "@choros/shared/agent-settings";
import { NOTIFICATION_VOLUME_LIMITS } from "@choros/shared/settings-constraints";
import { TRPCError } from "@trpc/server";
import { hasCustomRingtone } from "main/lib/custom-ringtones";
import { applyAppLanguage } from "main/lib/language";
import { localDb } from "main/lib/local-db";
import {
	DEFAULT_CONFIRM_ON_QUIT,
	DEFAULT_FILE_OPEN_MODE,
	DEFAULT_SHOW_RESOURCE_MONITOR,
	DEFAULT_TERMINAL_COPY_ON_SELECT,
	DEFAULT_TERMINAL_LINK_BEHAVIOR,
	DEFAULT_TERMINAL_PARKED_RUNTIME_CAP,
	DEFAULT_WAIT_FOR_SETUP_BEFORE_AGENT,
	MAX_TERMINAL_PARKED_RUNTIME_CAP,
	MIN_TERMINAL_PARKED_RUNTIME_CAP,
} from "shared/constants";
import {
	CUSTOM_RINGTONE_ID,
	DEFAULT_RINGTONE_ID,
	isBuiltInRingtoneId,
} from "shared/ringtones";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	normalizeAgentPresetPatch,
	normalizeCustomAgentPatch,
	updateAgentPresetInputSchema,
	updateCustomAgentInputSchema,
} from "./agent-preset-router.utils";
import {
	clearImportedCliTerminalScripts,
	isPendingCliTerminalScript,
} from "./cli-terminal-script-import";
import {
	setFontSettingsSchema,
	transformFontSettings,
} from "./font-settings.utils";
import {
	normalizeTerminalPresets,
	type PresetWithUnknownMode,
	shouldPersistNormalizedTerminalPresets,
} from "./preset-execution-mode";
import { getPresetsForTriggerField } from "./preset-trigger-selection";

function isValidRingtoneId(ringtoneId: string): boolean {
	if (isBuiltInRingtoneId(ringtoneId)) {
		return true;
	}

	if (ringtoneId === CUSTOM_RINGTONE_ID) {
		return hasCustomRingtone();
	}

	return false;
}

function getSettings() {
	let row = localDb.select().from(settings).get();
	if (!row) {
		row = localDb.insert(settings).values({ id: 1 }).returning().get();
	}
	return row;
}

function readRawTerminalPresets(): PresetWithUnknownMode[] {
	const row = getSettings();
	return (row.terminalPresets ?? []) as PresetWithUnknownMode[];
}

function getNormalizedTerminalPresets() {
	const rawPresets = readRawTerminalPresets();
	const normalizedPresets = normalizeTerminalPresets(rawPresets);

	if (shouldPersistNormalizedTerminalPresets(rawPresets)) {
		saveTerminalPresets(normalizedPresets);
	}

	return normalizedPresets;
}

function saveTerminalPresets(
	presets: TerminalPreset[],
	options?: { terminalPresetsInitialized?: boolean },
) {
	const values = { id: 1, terminalPresets: presets, ...options };
	localDb
		.insert(settings)
		.values(values)
		.onConflictDoUpdate({
			target: settings.id,
			set: { terminalPresets: presets, ...options },
		})
		.run();
}

let agentPresetPermissionsMigrationChecked = false;

function runAgentPresetPermissionsMigration() {
	if (agentPresetPermissionsMigrationChecked) return;
	const row = getSettings();
	if (row.agentPresetPermissionsMigratedAt) {
		agentPresetPermissionsMigrationChecked = true;
		return;
	}

	const isExistingUser =
		row.terminalPresetsInitialized === true &&
		terminalPresetsMatchPre3546Seed(row.terminalPresets);

	const nextOverrides = isExistingUser
		? applyLegacyPermissionsOverrides(
				readAgentPresetOverrides(row.agentPresetOverrides),
			)
		: undefined;

	const now = Date.now();
	const setFields = {
		agentPresetPermissionsMigratedAt: now,
		...(nextOverrides ? { agentPresetOverrides: nextOverrides } : {}),
	};
	localDb
		.insert(settings)
		.values({ id: 1, ...setFields })
		.onConflictDoUpdate({ target: settings.id, set: setFields })
		.run();

	agentPresetPermissionsMigrationChecked = true;
}

function readRawAgentPresetOverrides(): AgentPresetOverrideEnvelope {
	runAgentPresetPermissionsMigration();
	const row = getSettings();
	return readAgentPresetOverrides(row.agentPresetOverrides);
}

function readRawAgentCustomDefinitions(): AgentCustomDefinition[] {
	const row = getSettings();
	return row.agentCustomDefinitions ?? [];
}

function saveAgentPresetOverrides(overrides: AgentPresetOverrideEnvelope) {
	localDb
		.insert(settings)
		.values({
			id: 1,
			agentPresetOverrides: overrides,
		})
		.onConflictDoUpdate({
			target: settings.id,
			set: { agentPresetOverrides: overrides },
		})
		.run();
}

function saveAgentCustomDefinitions(definitions: AgentCustomDefinition[]) {
	localDb
		.insert(settings)
		.values({
			id: 1,
			agentCustomDefinitions: definitions,
		})
		.onConflictDoUpdate({
			target: settings.id,
			set: { agentCustomDefinitions: definitions },
		})
		.run();
}

function clearCustomAgentPresetOverride(id: `custom:${string}`) {
	saveAgentPresetOverrides(
		resetAgentPresetOverride({
			currentOverrides: readRawAgentPresetOverrides(),
			id,
		}),
	);
}

function getResolvedAgentPresets() {
	return resolveAgentConfigs({
		customDefinitions: readRawAgentCustomDefinitions(),
		overrideEnvelope: readRawAgentPresetOverrides(),
	});
}

const DEFAULT_PRESETS: Omit<TerminalPreset, "id">[] =
	DEFAULT_TERMINAL_PRESET_AGENT_TYPES.map((name) => ({
		name,
		description: AGENT_PRESET_DESCRIPTIONS[name],
		cwd: "",
		commands: AGENT_PRESET_COMMANDS[name],
	}));

function _initializeDefaultPresets() {
	const row = getSettings();
	if (row.terminalPresetsInitialized) return row.terminalPresets ?? [];

	const existingPresets = getNormalizedTerminalPresets();

	const mergedPresets =
		existingPresets.length > 0
			? existingPresets
			: DEFAULT_PRESETS.map((p) => ({
					id: crypto.randomUUID(),
					...p,
					executionMode: p.executionMode ?? "new-tab",
				}));

	saveTerminalPresets(mergedPresets, { terminalPresetsInitialized: true });

	return mergedPresets;
}

/** Get presets tagged with a given auto-apply field for the current project, falling back to all-project presets. */
export function getPresetsForTrigger(
	field: "applyOnWorkspaceCreated" | "applyOnNewTab",
	projectId?: string | null,
) {
	return getPresetsForTriggerField(
		getNormalizedTerminalPresets(),
		field,
		projectId,
	);
}

export const createSettingsRouter = () => {
	return router({
		getPendingCliTerminalScripts: publicProcedure.query(() =>
			getNormalizedTerminalPresets().filter(isPendingCliTerminalScript),
		),
		acknowledgeCliTerminalScripts: publicProcedure
			.input(z.object({ ids: z.array(z.string()).min(1) }))
			.mutation(({ input }) =>
				// Immediate transaction: a concurrent `choros scripts add` must not
				// land between this read and write or its row would be dropped.
				localDb.transaction(
					() => {
						const result = clearImportedCliTerminalScripts({
							scripts: getNormalizedTerminalPresets(),
							ids: input.ids,
						});
						if (result.changed) saveTerminalPresets(result.scripts);
						return { acknowledged: result.changed };
					},
					{ behavior: "immediate" },
				),
			),
		getAgentPresets: publicProcedure.query(() => getResolvedAgentPresets()),
		updateCustomAgent: publicProcedure
			.input(updateCustomAgentInputSchema)
			.mutation(({ input }) => {
				const definition = getCustomAgentDefinitionById({
					customDefinitions: readRawAgentCustomDefinitions(),
					id: input.id as `custom:${string}`,
				});
				if (!definition) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Custom agent ${input.id} not found`,
					});
				}

				const nextDefinitions = upsertCustomAgentDefinition({
					currentDefinitions: readRawAgentCustomDefinitions(),
					definition: applyCustomAgentDefinitionPatch({
						definition,
						patch: normalizeCustomAgentPatch(input.patch),
					}),
				});

				saveAgentCustomDefinitions(nextDefinitions);
				clearCustomAgentPresetOverride(input.id as `custom:${string}`);

				return getResolvedAgentPresets().find(
					(preset) => preset.id === input.id,
				);
			}),
		updateAgentPreset: publicProcedure
			.input(updateAgentPresetInputSchema)
			.mutation(({ input }) => {
				const definition = getAgentDefinitionById({
					customDefinitions: readRawAgentCustomDefinitions(),
					id: input.id as AgentDefinitionId,
				});
				if (!definition) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Agent preset ${input.id} not found`,
					});
				}
				if (definition.source === "user") {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `Custom agent ${input.id} must be edited through custom-agent settings`,
					});
				}

				const normalizedPatch = normalizeAgentPresetPatch({
					patch: input.patch,
				});
				const nextOverrides = createOverrideEnvelopeWithPatch({
					definition,
					currentOverrides: readRawAgentPresetOverrides(),
					id: input.id as AgentDefinitionId,
					patch: normalizedPatch,
				});

				saveAgentPresetOverrides(nextOverrides);

				return getResolvedAgentPresets().find(
					(preset) => preset.id === input.id,
				);
			}),
		resetAgentPreset: publicProcedure
			.input(z.object({ id: z.string().min(1) }))
			.mutation(({ input }) => {
				const nextOverrides = resetAgentPresetOverride({
					currentOverrides: readRawAgentPresetOverrides(),
					id: input.id as AgentDefinitionId,
				});
				saveAgentPresetOverrides(nextOverrides);
				return { success: true };
			}),

		// App display language: "auto"/null = follow the system language.
		getLanguage: publicProcedure.query(() => {
			const row = getSettings();
			const stored = row.language;
			return stored && isSupportedLocale(stored) ? stored : null;
		}),

		setLanguage: publicProcedure
			.input(z.object({ language: z.string().nullable() }))
			.mutation(async ({ input }) => {
				const value =
					input.language === null || input.language === "auto"
						? null
						: input.language;
				if (value !== null && !isSupportedLocale(value)) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `Unsupported language: ${value}`,
					});
				}
				localDb
					.insert(settings)
					.values({ id: 1, language: value })
					.onConflictDoUpdate({
						target: settings.id,
						set: { language: value },
					})
					.run();
				// The application and tray menus resolve their labels when they are
				// built, so they need an explicit rebuild on a language change.
				// Awaited: the catalog for the new locale loads on demand.
				await applyAppLanguage(value);
			}),

		getSelectedRingtoneId: publicProcedure.query(() => {
			const row = getSettings();
			const storedId = row.selectedRingtoneId;

			if (!storedId) {
				return DEFAULT_RINGTONE_ID;
			}

			if (isValidRingtoneId(storedId)) {
				return storedId;
			}

			console.warn(
				`[settings] Invalid ringtone ID "${storedId}" found, resetting to default`,
			);
			localDb
				.insert(settings)
				.values({ id: 1, selectedRingtoneId: DEFAULT_RINGTONE_ID })
				.onConflictDoUpdate({
					target: settings.id,
					set: { selectedRingtoneId: DEFAULT_RINGTONE_ID },
				})
				.run();
			return DEFAULT_RINGTONE_ID;
		}),

		setSelectedRingtoneId: publicProcedure
			.input(z.object({ ringtoneId: z.string() }))
			.mutation(({ input }) => {
				if (!isValidRingtoneId(input.ringtoneId)) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `Invalid ringtone ID: ${input.ringtoneId}`,
					});
				}

				localDb
					.insert(settings)
					.values({ id: 1, selectedRingtoneId: input.ringtoneId })
					.onConflictDoUpdate({
						target: settings.id,
						set: { selectedRingtoneId: input.ringtoneId },
					})
					.run();

				return { success: true };
			}),

		getConfirmOnQuit: publicProcedure.query(() => {
			const row = getSettings();
			return row.confirmOnQuit ?? DEFAULT_CONFIRM_ON_QUIT;
		}),

		setConfirmOnQuit: publicProcedure
			.input(z.object({ enabled: z.boolean() }))
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, confirmOnQuit: input.enabled })
					.onConflictDoUpdate({
						target: settings.id,
						set: { confirmOnQuit: input.enabled },
					})
					.run();

				return { success: true };
			}),

		getTerminalLinkBehavior: publicProcedure.query(() => {
			const row = getSettings();
			return row.terminalLinkBehavior ?? DEFAULT_TERMINAL_LINK_BEHAVIOR;
		}),

		setTerminalLinkBehavior: publicProcedure
			.input(z.object({ behavior: z.enum(TERMINAL_LINK_BEHAVIORS) }))
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, terminalLinkBehavior: input.behavior })
					.onConflictDoUpdate({
						target: settings.id,
						set: { terminalLinkBehavior: input.behavior },
					})
					.run();

				return { success: true };
			}),

		getFileOpenMode: publicProcedure.query(() => {
			const row = getSettings();
			return row.fileOpenMode ?? DEFAULT_FILE_OPEN_MODE;
		}),

		setFileOpenMode: publicProcedure
			.input(z.object({ mode: z.enum(FILE_OPEN_MODES) }))
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, fileOpenMode: input.mode })
					.onConflictDoUpdate({
						target: settings.id,
						set: { fileOpenMode: input.mode },
					})
					.run();

				return { success: true };
			}),

		getWaitForSetupBeforeAgent: publicProcedure.query(() => {
			const row = getSettings();
			return row.waitForSetupBeforeAgent ?? DEFAULT_WAIT_FOR_SETUP_BEFORE_AGENT;
		}),

		setWaitForSetupBeforeAgent: publicProcedure
			.input(z.object({ enabled: z.boolean() }))
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, waitForSetupBeforeAgent: input.enabled })
					.onConflictDoUpdate({
						target: settings.id,
						set: { waitForSetupBeforeAgent: input.enabled },
					})
					.run();

				return { success: true };
			}),

		getNotificationSoundsMuted: publicProcedure.query(() => {
			const row = getSettings();
			return row.notificationSoundsMuted ?? false;
		}),

		setNotificationSoundsMuted: publicProcedure
			.input(z.object({ muted: z.boolean() }))
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, notificationSoundsMuted: input.muted })
					.onConflictDoUpdate({
						target: settings.id,
						set: { notificationSoundsMuted: input.muted },
					})
					.run();

				return { success: true };
			}),

		getNotificationVolume: publicProcedure.query(() => {
			const row = getSettings();
			return row.notificationVolume ?? 100;
		}),

		setNotificationVolume: publicProcedure
			.input(
				z.object({
					volume: z
						.number()
						.min(NOTIFICATION_VOLUME_LIMITS.min)
						.max(NOTIFICATION_VOLUME_LIMITS.max),
				}),
			)
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, notificationVolume: input.volume })
					.onConflictDoUpdate({
						target: settings.id,
						set: { notificationVolume: input.volume },
					})
					.run();

				return { success: true };
			}),

		getFontSettings: publicProcedure.query(() => {
			const row = getSettings();
			return {
				terminalFontFamily: row.terminalFontFamily ?? null,
				terminalFontSize: row.terminalFontSize ?? null,
				terminalLineHeight: row.terminalLineHeight ?? null,
				terminalLetterSpacing: row.terminalLetterSpacing ?? null,
				terminalFontWeight: row.terminalFontWeight ?? null,
				terminalLigatures: row.terminalLigatures ?? null,
				terminalMinimumContrast: row.terminalMinimumContrast ?? null,
				terminalCursorStyle: row.terminalCursorStyle ?? null,
				terminalCursorBlink: row.terminalCursorBlink ?? null,
				editorFontFamily: row.editorFontFamily ?? null,
				editorFontSize: row.editorFontSize ?? null,
				editorLineHeight: row.editorLineHeight ?? null,
				editorLetterSpacing: row.editorLetterSpacing ?? null,
				editorFontWeight: row.editorFontWeight ?? null,
				editorLigatures: row.editorLigatures ?? null,
			};
		}),

		setFontSettings: publicProcedure
			.input(setFontSettingsSchema)
			.mutation(({ input }) => {
				const set = transformFontSettings(input);

				if (Object.keys(set).length === 0) {
					return { success: true };
				}

				localDb
					.insert(settings)
					.values({ id: 1, ...set })
					.onConflictDoUpdate({
						target: settings.id,
						set,
					})
					.run();

				return { success: true };
			}),

		getTerminalParkedRuntimeCap: publicProcedure.query(() => {
			const row = getSettings();
			return (
				row.terminalParkedRuntimeCap ?? DEFAULT_TERMINAL_PARKED_RUNTIME_CAP
			);
		}),

		setTerminalParkedRuntimeCap: publicProcedure
			.input(
				z.object({
					cap: z
						.number()
						.int()
						.min(MIN_TERMINAL_PARKED_RUNTIME_CAP)
						.max(MAX_TERMINAL_PARKED_RUNTIME_CAP),
				}),
			)
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, terminalParkedRuntimeCap: input.cap })
					.onConflictDoUpdate({
						target: settings.id,
						set: { terminalParkedRuntimeCap: input.cap },
					})
					.run();

				return { success: true };
			}),

		getTerminalCopyOnSelect: publicProcedure.query(() => {
			const row = getSettings();
			return row.terminalCopyOnSelect ?? DEFAULT_TERMINAL_COPY_ON_SELECT;
		}),

		setTerminalCopyOnSelect: publicProcedure
			.input(z.object({ enabled: z.boolean() }))
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, terminalCopyOnSelect: input.enabled })
					.onConflictDoUpdate({
						target: settings.id,
						set: { terminalCopyOnSelect: input.enabled },
					})
					.run();

				return { success: true };
			}),

		getShowResourceMonitor: publicProcedure.query(() => {
			const row = getSettings();
			return row.showResourceMonitor ?? DEFAULT_SHOW_RESOURCE_MONITOR;
		}),

		setShowResourceMonitor: publicProcedure
			.input(z.object({ enabled: z.boolean() }))
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, showResourceMonitor: input.enabled })
					.onConflictDoUpdate({
						target: settings.id,
						set: { showResourceMonitor: input.enabled },
					})
					.run();

				return { success: true };
			}),

		getBrowserHomepageUrl: publicProcedure.query(() => {
			const row = getSettings();
			return row.browserHomepageUrl ?? null;
		}),

		setBrowserHomepageUrl: publicProcedure
			.input(z.object({ url: z.string().trim().nullable() }))
			.mutation(({ input }) => {
				// An empty string clears the override; the pane falls back to about:blank.
				const url = input.url && input.url.length > 0 ? input.url : null;
				localDb
					.insert(settings)
					.values({ id: 1, browserHomepageUrl: url })
					.onConflictDoUpdate({
						target: settings.id,
						set: { browserHomepageUrl: url },
					})
					.run();

				return { success: true };
			}),

		getDefaultEditor: publicProcedure.query(() => {
			const row = getSettings();
			return row.defaultEditor ?? null;
		}),

		/**
		 * Re-runs wrapper/settings/hook setup for one agent. Safety net for
		 * the settings-UI Add flow; returns `{ ran: false }` for unknown ids.
		 * Adding an agent expresses intent to integrate it, so a previously
		 * disabled hooks toggle is cleared first.
		 */
		setupAgent: publicProcedure
			.input(z.object({ agentId: z.string().min(1) }))
			.mutation(({ input }) => {
				const disabled = getSettings().disabledAgentHooks ?? [];
				if (disabled.includes(input.agentId)) {
					const next = disabled.filter((id) => id !== input.agentId);
					localDb
						.insert(settings)
						.values({ id: 1, disabledAgentHooks: next })
						.onConflictDoUpdate({
							target: settings.id,
							set: { disabledAgentHooks: next },
						})
						.run();
					writeSharedDisabledAgentIds(next);
				}
				const ran = setupSingleAgent(input.agentId);
				return { ran };
			}),

		getAgentHooksDisabled: publicProcedure.query(() => {
			return getSettings().disabledAgentHooks ?? [];
		}),

		/**
		 * Toggles Choros's hook integration for one agent. Disabling removes
		 * the managed entries from the agent's global config immediately;
		 * startup re-applies the choice so it survives older app versions
		 * re-adding them.
		 */
		setAgentHooksEnabled: publicProcedure
			.input(z.object({ agentId: z.string().min(1), enabled: z.boolean() }))
			.mutation(({ input }) => {
				const current = new Set(getSettings().disabledAgentHooks ?? []);
				if (input.enabled) {
					current.delete(input.agentId);
				} else {
					current.add(input.agentId);
				}
				const next = [...current];
				localDb
					.insert(settings)
					.values({ id: 1, disabledAgentHooks: next })
					.onConflictDoUpdate({
						target: settings.id,
						set: { disabledAgentHooks: next },
					})
					.run();
				writeSharedDisabledAgentIds(next);

				const ran = input.enabled
					? setupSingleAgent(input.agentId)
					: teardownSingleAgent(input.agentId);
				return { ran };
			}),
	});
};
