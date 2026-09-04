import type { SettingItemId } from "../../../utils/settings-search";
import { V2AgentsSettings } from "../v2-agents-settings";

interface AgentsSettingsProps {
	visibleItems?: SettingItemId[] | null;
	initialAgentId?: string | null;
}

export function AgentsSettings({ initialAgentId }: AgentsSettingsProps) {
	return <V2AgentsSettings initialAgentId={initialAgentId} />;
}
