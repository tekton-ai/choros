import { useCallback, useSyncExternalStore } from "react";
import {
	type BrowserRuntimeState,
	browserRuntimeRegistry,
} from "../../browser-runtime-registry";

export function useBrowserState(paneId: string): BrowserRuntimeState {
	return useSyncExternalStore(
		useCallback(
			(cb) => browserRuntimeRegistry.onStateChange(paneId, cb),
			[paneId],
		),
		useCallback(() => browserRuntimeRegistry.getState(paneId), [paneId]),
	);
}
