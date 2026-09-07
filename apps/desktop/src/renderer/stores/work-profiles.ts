import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/**
 * EXPERIMENT: opt in to Work Profiles; off by default.
 * Fixed-size singleton preference retained for this installation's lifetime;
 * stores no Profile data. Removing the experiment must remove its toggle,
 * search entry and flag branches, and register `work-profiles` in DEAD_KEYS
 * so the boot sweep deletes the retired key.
 */
interface WorkProfilesState {
	enabled: boolean;
	setEnabled: (enabled: boolean) => void;
}

export const useWorkProfilesStore = create<WorkProfilesState>()(
	devtools(
		persist(
			(set) => ({
				enabled: false,
				setEnabled: (enabled) => set({ enabled }),
			}),
			{ name: "work-profiles" },
		),
		{ name: "WorkProfilesStore" },
	),
);

/** Single read path for the Work Profiles experiment flag. */
export function useWorkProfilesEnabled(): boolean {
	return useWorkProfilesStore((state) => state.enabled);
}
