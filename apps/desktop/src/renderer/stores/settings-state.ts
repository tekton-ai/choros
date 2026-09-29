import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";
import { useAutomationsExperimentEnabled } from "./automations-experiment";

export type SettingsSection =
	| "account"
	| "organization"
	| "teams"
	| "appearance"
	| "ringtones"
	| "usage"
	| "keyboard"
	| "behavior"
	| "browser"
	| "git"
	| "agents"
	| "terminal"
	| "links"
	| "models"
	| "experimental"
	| "integrations"
	| "billing"
	| "apikeys"
	| "permissions"
	| "security"
	| "project"
	| "hosts";

interface SettingsOriginRoute {
	to: string;
	search: Record<string, unknown>;
	hash: string;
}

interface SettingsState {
	activeSection: SettingsSection;
	activeProjectId: string | null;
	searchQuery: string;
	isOpen: boolean;
	originRoute: SettingsOriginRoute;

	setActiveSection: (section: SettingsSection) => void;
	setActiveProject: (projectId: string | null) => void;
	setSearchQuery: (query: string) => void;
	openSettings: (section?: SettingsSection) => void;
	closeSettings: () => void;
	setOriginRoute: (route: SettingsOriginRoute) => void;
}

export const useSettingsStore = create<SettingsState>()(
	devtools(
		persist(
			(set) => ({
				activeSection: "account",
				activeProjectId: null,
				searchQuery: "",
				isOpen: false,
				originRoute: { to: "/v2-workspaces", search: {}, hash: "" },

				setActiveSection: (section) => set({ activeSection: section }),

				setActiveProject: (projectId) =>
					set({
						activeProjectId: projectId,
						activeSection: "project",
					}),

				setSearchQuery: (query) => set({ searchQuery: query }),

				openSettings: (section) =>
					set({
						isOpen: true,
						activeSection: section ?? "account",
					}),

				closeSettings: () =>
					set({
						isOpen: false,
						searchQuery: "",
					}),

				setOriginRoute: (route) => set({ originRoute: route }),
			}),
			{
				name: "settings-navigation",
				storage: createJSONStorage(() => sessionStorage),
				partialize: (state) => ({ originRoute: state.originRoute }),
			},
		),
		{ name: "SettingsStore" },
	),
);

export const useSettingsSection = () =>
	useSettingsStore((state) => state.activeSection);
export const useSetSettingsSection = () =>
	useSettingsStore((state) => state.setActiveSection);
export const useSettingsSearchQuery = () =>
	useSettingsStore((state) => state.searchQuery);
export const useSetSettingsSearchQuery = () =>
	useSettingsStore((state) => state.setSearchQuery);
export const useActiveProjectId = () =>
	useSettingsStore((state) => state.activeProjectId);
export const useCloseSettings = () =>
	useSettingsStore((state) => state.closeSettings);
export const useSettingsOriginRoute = () => {
	const originRoute = useSettingsStore((state) => state.originRoute);
	const automationsEnabled = useAutomationsExperimentEnabled();
	// Do not send Back/Escape straight into a route the user just disabled.
	if (
		!automationsEnabled &&
		(originRoute === "/automations" || originRoute.startsWith("/automations/"))
	)
		return "/v2-workspaces";
	return originRoute;
};
