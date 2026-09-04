import { useCallback } from "react";
import { useV2UserPreferences } from "renderer/hooks/use-v2-user-preferences";
import type { ModifierEvent } from "../types";
import {
	type FolderIntent,
	type FolderTierMap,
	folderIntentForMap,
} from "./folder-policy";

export interface FolderClickPolicy {
	getIntent: (event: ModifierEvent) => FolderIntent;
	map: FolderTierMap;
}

/** Settings-driven click policy for folder links in terminal output. */
export function useTerminalFolderPolicy(): FolderClickPolicy {
	const { preferences } = useV2UserPreferences();
	const map = preferences.folderLinks;
	const getIntent = useCallback(
		(event: ModifierEvent) => folderIntentForMap(event, map),
		[map],
	);
	return { getIntent, map };
}
