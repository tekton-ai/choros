import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/**
 * Desktop entry-point experiment, off by default. One boolean, no task data.
 * Hiding the UI does not pause Host schedules, cancel runs, or erase history.
 * On retirement remove the toggle/search/gates and add this key to DEAD_KEYS.
 */
interface AutomationsExperimentState {
	enabled: boolean;
	setEnabled: (enabled: boolean) => void;
}

export const useAutomationsExperimentStore =
	create<AutomationsExperimentState>()(
		devtools(
			persist(
				(set) => ({
					enabled: false,
					setEnabled: (enabled) => set({ enabled }),
				}),
				{ name: "automations-experiment" },
			),
			{ name: "AutomationsExperimentStore" },
		),
	);

export function useAutomationsExperimentEnabled(): boolean {
	return useAutomationsExperimentStore((state) => state.enabled);
}
