import { Label } from "@choros/ui/label";
import { Switch } from "@choros/ui/switch";
import { Trans, useLingui } from "@lingui/react/macro";

import { HighlightText } from "renderer/routes/_authenticated/settings/components/highlight-text";
import {
	useInlineWorkspacePortsStore,
	usePortsDisplayMode,
} from "renderer/stores/inline-workspace-ports";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import {
	useWorkspaceAgentsRowEnabled,
	useWorkspaceAgentsRowStore,
} from "renderer/stores/workspace-agents-row";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { WaitForSetupBeforeAgentSetting } from "./components/wait-for-setup-before-agent-setting";

interface ExperimentalSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function ExperimentalSettings({
	visibleItems,
}: ExperimentalSettingsProps) {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const showInlineWorkspacePorts = isItemVisible(
		SETTING_ITEM_ID.EXPERIMENTAL_INLINE_WORKSPACE_PORTS,
		visibleItems,
	);
	const showWorkspaceAgents = isItemVisible(
		SETTING_ITEM_ID.EXPERIMENTAL_WORKSPACE_AGENTS,
		visibleItems,
	);
	const showWaitForSetupBeforeAgent = isItemVisible(
		SETTING_ITEM_ID.EXPERIMENTAL_WAIT_FOR_SETUP_BEFORE_AGENT,
		visibleItems,
	);
	const portsDisplayMode = usePortsDisplayMode();
	const setPortsDisplayMode = useInlineWorkspacePortsStore(
		(state) => state.setMode,
	);
	const workspaceAgentsEnabled = useWorkspaceAgentsRowEnabled();
	const setWorkspaceAgentsEnabled = useWorkspaceAgentsRowStore(
		(state) => state.setEnabled,
	);

	return (
		<div className="p-6 max-w-4xl w-full mx-auto">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">
					<Trans id="settings.experimental.title">Experimental</Trans>
				</h2>
				<p className="text-sm text-muted-foreground mt-1">
					<Trans id="settings.experimental.subtitle">
						Try early access features and previews.
					</Trans>
				</p>
			</div>

			<div className="space-y-6">
				{showInlineWorkspacePorts && (
					<div className="flex items-center justify-between gap-6">
						<div className="min-w-0 flex-1 space-y-0.5">
							<Label
								htmlFor="inline-workspace-ports"
								className="text-sm font-medium"
							>
								<HighlightText
									text={t({
										id: "settings.experimental.inlinePortsLabel",
										message: "Ports in top bar dropdown",
									})}
									query={searchQuery}
								/>
							</Label>
							<p className="text-xs text-muted-foreground">
								<HighlightText
									text={t({
										id: "settings.experimental.inlinePortsHint",
										message:
											"Show detected ports as a dropdown in the top bar instead of a chip under each workspace in the sidebar.",
									})}
									query={searchQuery}
								/>
							</p>
						</div>
						<Switch
							id="inline-workspace-ports"
							checked={portsDisplayMode === "topbar"}
							onCheckedChange={(checked) =>
								setPortsDisplayMode(checked ? "topbar" : "inline")
							}
						/>
					</div>
				)}
				{showWorkspaceAgents && (
					<div className="flex items-center justify-between gap-6">
						<div className="min-w-0 flex-1 space-y-0.5">
							<Label htmlFor="workspace-agents" className="text-sm font-medium">
								<HighlightText
									text={t({
										id: "settings.experimental.workspaceAgentsLabel",
										message: "Workspace agents",
									})}
									query={searchQuery}
								/>
							</Label>
							<p className="text-xs text-muted-foreground">
								<HighlightText
									text={t({
										id: "settings.experimental.workspaceAgentsHint",
										message:
											"Show running agents under each workspace in the sidebar, with their live status.",
									})}
									query={searchQuery}
								/>
							</p>
						</div>
						<Switch
							id="workspace-agents"
							checked={workspaceAgentsEnabled}
							onCheckedChange={setWorkspaceAgentsEnabled}
						/>
					</div>
				)}
				{showWaitForSetupBeforeAgent && <WaitForSetupBeforeAgentSetting />}
			</div>
		</div>
	);
}
