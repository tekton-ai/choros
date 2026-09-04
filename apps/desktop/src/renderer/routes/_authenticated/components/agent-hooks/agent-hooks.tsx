import { useLocalHostService } from "renderer/routes/_authenticated/providers/local-host-service-provider";
import { useCliTerminalScriptImport } from "./hooks/use-cli-terminal-script-import";
import { useDefaultV2TerminalPresets } from "./hooks/use-default-v2-terminal-presets";
import { usePlaceLocalWorktreesInSidebar } from "./hooks/use-place-local-worktrees-in-sidebar";

/**
 * Component that runs agent-related hooks requiring CollectionsProvider context.
 */
export function AgentHooks() {
	const { activeHostUrl } = useLocalHostService();
	// Seeds the default v2 terminal presets and warms the local host's agent
	// config cache for Settings.
	useDefaultV2TerminalPresets(activeHostUrl);
	useCliTerminalScriptImport();
	usePlaceLocalWorktreesInSidebar();
	return null;
}
