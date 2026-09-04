import { Workspace } from "@choros/panes";
import { workspaceTrpc } from "@choros/workspace-client";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useQuickOpenStore } from "renderer/command-palette/ui/quick-open/quick-open-store";
import { ZoomStable } from "renderer/components/zoom-stable";
import { useV2UserPreferences } from "renderer/hooks/use-v2-user-preferences";
import { useZoomFactor } from "renderer/hooks/use-zoom-factor";
import { useHotkey } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { NavigationControls } from "renderer/routes/_authenticated/_dashboard/components/navigation-controls";
import { SidebarToggle } from "renderer/routes/_authenticated/_dashboard/components/sidebar-toggle";
import { RightSidebarToggle } from "renderer/routes/_authenticated/_dashboard/components/top-bar/components/right-sidebar-toggle";
import { TopBarPortsDropdown } from "renderer/routes/_authenticated/_dashboard/components/top-bar/components/top-bar-ports-dropdown";
import { WindowControls } from "renderer/routes/_authenticated/_dashboard/components/top-bar/components/window-controls";
import { CommandPalette } from "renderer/screens/main/components/command-palette";
import { ResizablePanel } from "renderer/screens/main/components/resizable-panel";
import { getV2NotificationSourcesForTab } from "renderer/stores/v2-notifications";
import {
	COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
	useWorkspaceSidebarStore,
} from "renderer/stores/workspace-sidebar-state";
import { StateScreenShell } from "../components/state-screen-shell";
import { useWorkspace } from "../providers/workspace-provider";
import { AddTabMenu } from "./components/add-tab-menu";
import { BackgroundTerminalsButton } from "./components/background-terminals-button";
import { V2NotificationStatusIndicator } from "./components/v2-notification-status-indicator";
import { V2PresetsBar } from "./components/v2-presets-bar";
import { V2WorkspaceRunButton } from "./components/v2-workspace-run-button";
import { WorkspaceEmptyState } from "./components/workspace-empty-state";
import { WorkspaceMissingWorktreeState } from "./components/workspace-missing-worktree-state";
import { WorkspaceSidebar } from "./components/workspace-sidebar";
import { useAutoAdoptBackgroundSessions } from "./hooks/use-auto-adopt-background-sessions";
import { useBrowserShellInteractionPassthrough } from "./hooks/use-browser-shell-interaction-passthrough";
import { useClearActivePaneAttention } from "./hooks/use-clear-active-pane-attention";
import { useConsumeOpenUrlRequest } from "./hooks/use-consume-open-url-request";
import { useDefaultContextMenuActions } from "./hooks/use-default-context-menu-actions";
import { useDefaultPaneActions } from "./hooks/use-default-pane-actions";
import { usePaneRegistry } from "./hooks/use-pane-registry";
import { renderBrowserTabIcon } from "./hooks/use-pane-registry/components/browser-pane";
import { useSlotElement } from "./hooks/use-slot-element";
import { useTabCloseGuard } from "./hooks/use-tab-close-guard";
import { useV2PresetExecution } from "./hooks/use-v2-preset-execution";
import { useV2TerminalLauncher } from "./hooks/use-v2-terminal-launcher";
import { useV2WorkspacePaneLayout } from "./hooks/use-v2-workspace-pane-layout";
import { useV2WorkspaceRun } from "./hooks/use-v2-workspace-run";
import { useWorkspaceFileNavigation } from "./hooks/use-workspace-file-navigation";
import { useWorkspaceHotkeys } from "./hooks/use-workspace-hotkeys";
import { useWorkspacePaneOpeners } from "./hooks/use-workspace-pane-openers";
import { WorkspaceGitStatusProvider } from "./providers/workspace-git-status-provider";
import { FileDocumentStoreProvider } from "./state/file-document-store";
import type { PaneViewerData } from "./types";
import type { V2WorkspaceUrlOpenTarget } from "./utils/open-url-in-v2-workspace";

interface WorkspaceSearch {
	openUrl?: string;
	openUrlTarget?: V2WorkspaceUrlOpenTarget;
	openUrlRequestId?: string;
}

function parseOpenUrlTarget(
	value: unknown,
): V2WorkspaceUrlOpenTarget | undefined {
	if (value === "current-tab" || value === "new-tab") return value;
	return undefined;
}

function parseNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-workspace/$workspaceId/",
)({
	component: V2WorkspacePage,
	validateSearch: (raw: Record<string, unknown>): WorkspaceSearch => ({
		openUrl: parseNonEmptyString(raw.openUrl),
		openUrlTarget: parseOpenUrlTarget(raw.openUrlTarget),
		openUrlRequestId: parseNonEmptyString(raw.openUrlRequestId),
	}),
});

function V2WorkspacePage() {
	const { workspace } = useWorkspace();
	const workspaceStatusQuery = workspaceTrpc.workspace.get.useQuery(
		{ id: workspace.id },
		{
			refetchOnWindowFocus: true,
		},
	);

	if (workspaceStatusQuery.data?.worktreeExists === false) {
		return (
			<StateScreenShell>
				<WorkspaceMissingWorktreeState
					workspaceId={workspace.id}
					workspaceName={workspace.name}
					branch={workspace.branch}
					worktreePath={workspaceStatusQuery.data?.worktreePath}
					onRefresh={() => {
						void workspaceStatusQuery.refetch();
					}}
					isRefreshing={workspaceStatusQuery.isFetching}
				/>
			</StateScreenShell>
		);
	}

	return <V2WorkspaceContent />;
}

function V2WorkspaceContent() {
	const { openUrl, openUrlTarget, openUrlRequestId } = Route.useSearch();
	const { workspace } = useWorkspace();
	const workspaceId = workspace.id;

	const {
		preferences: v2UserPreferences,
		setRightSidebarOpen,
		setRightSidebarTab,
		setRightSidebarWidth,
		setShowPresetsBar,
	} = useV2UserPreferences();
	const showPresetsBar = v2UserPreferences.showPresetsBar;
	const sidebarOpen = v2UserPreferences.rightSidebarOpen;
	const { store, isLayoutReady } = useV2WorkspacePaneLayout();
	useClearActivePaneAttention({ store });
	const launcher = useV2TerminalLauncher();
	const {
		matchedPresets,
		newTabPresets,
		executePreset,
		resolvePresetCommands,
	} = useV2PresetExecution({
		store,
		launcher,
	});
	const workspaceRun = useV2WorkspaceRun({
		store,
		launcher,
		matchedPresets,
		resolvePresetCommands,
	});
	useAutoAdoptBackgroundSessions({ store, workspaceId, isLayoutReady });
	useConsumeOpenUrlRequest({
		store,
		url: openUrl,
		target: openUrlTarget,
		requestId: openUrlRequestId,
	});

	const {
		openFilePaneFromTreeClick,
		revealPath,
		selectedFilePath,
		pendingReveal,
		recentFiles,
		openFilePaths,
	} = useWorkspaceFileNavigation({
		store,
		setRightSidebarOpen,
		setRightSidebarTab,
	});

	const paneRegistry = usePaneRegistry({
		onOpenFile: openFilePaneFromTreeClick,
		onRevealPath: revealPath,
		launcher,
		store,
	});
	const defaultContextMenuActions = useDefaultContextMenuActions({
		paneRegistry,
		launcher,
	});
	const {
		openDiffPane,
		addTerminalTab,
		addChatV3Tab,
		addBrowserTab,
		openCommentPane,
	} = useWorkspacePaneOpeners({
		store,
		launcher,
		newTabPresets,
		executePreset,
	});

	const quickOpenOpen = useQuickOpenStore(
		(s) => s.open && s.target?.workspaceId === workspaceId,
	);
	const closeQuickOpen = useQuickOpenStore((s) => s.close);
	const openQuickOpenFor = useQuickOpenStore((s) => s.openFor);
	const handleQuickOpen = useCallback(
		() => openQuickOpenFor({ workspaceId }),
		[openQuickOpenFor, workspaceId],
	);
	const handleQuickOpenChange = useCallback(
		(next: boolean) => {
			if (!next) closeQuickOpen();
		},
		[closeQuickOpen],
	);
	// Picking a file from Quick Open should surface the sidebar/Files tab so
	// the reveal (expand + highlight + scroll) is actually visible.
	const handleQuickOpenSelectFile = useCallback(
		(filePath: string, openInNewTab?: boolean) => {
			setRightSidebarOpen(true);
			setRightSidebarTab("files");
			openFilePaneFromTreeClick(filePath, openInNewTab);
		},
		[openFilePaneFromTreeClick, setRightSidebarOpen, setRightSidebarTab],
	);
	const defaultPaneActions = useDefaultPaneActions({ launcher });
	const onBeforeCloseTab = useTabCloseGuard();

	// Fallback for rows persisted before the rightSidebarWidth field existed —
	// the live collection skips zod defaults, so an older row reads undefined
	// here and would render the ResizablePanel without a width (full-bleed).
	const sidebarWidth = v2UserPreferences.rightSidebarWidth ?? 340;
	const [isSidebarResizing, setIsSidebarResizing] = useState(false);
	const { onSidebarResizeDragging, onWorkspaceInteractionStateChange } =
		useBrowserShellInteractionPassthrough({ sidebarOpen });
	const handleSidebarResizingChange = useCallback(
		(resizing: boolean) => {
			setIsSidebarResizing(resizing);
			onSidebarResizeDragging(resizing);
		},
		[onSidebarResizeDragging],
	);

	// The sidebar slot lives at the dashboard layout level (next to TopBar) so
	// the sidebar runs full-height.
	const sidebarSlotEl = useSlotElement("workspace-right-sidebar-slot");

	useWorkspaceHotkeys({
		store,
		matchedPresets,
		executePreset,
		addTerminalTab,
		paneRegistry,
		launcher,
		onBeforeCloseTab,
	});
	useHotkey("QUICK_OPEN", handleQuickOpen);
	useHotkey("RUN_WORKSPACE_COMMAND", () => {
		void workspaceRun.toggleWorkspaceRun();
	});

	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	// Default to Mac while loading so window controls don't flash in.
	const isMac = platform === undefined || platform === "darwin";
	const zoomFactor = useZoomFactor();
	const isSidebarPanelOpen = useWorkspaceSidebarStore((s) => s.isOpen);
	const isSidebarPanelCollapsed = useWorkspaceSidebarStore((s) =>
		s.isCollapsed(),
	);
	// With the sidebar collapsed the TopBar is hidden, so the tab bar hosts the
	// traffic-light overhang past the rail plus the sidebar/nav controls.
	const tabBarHostsChrome = isSidebarPanelOpen && isSidebarPanelCollapsed;

	const workspaceRunButton = (
		<V2WorkspaceRunButton
			projectId={workspace.projectId}
			definition={workspaceRun.definition}
			isRunning={workspaceRun.isRunning}
			isPending={workspaceRun.isPending}
			canForceStop={workspaceRun.canForceStop}
			onToggle={workspaceRun.toggleWorkspaceRun}
			onForceStop={workspaceRun.forceStopWorkspaceRun}
		/>
	);

	return (
		<FileDocumentStoreProvider>
			<WorkspaceGitStatusProvider
				workspaceId={workspaceId}
				store={store}
				sidebarOpen={sidebarOpen}
			>
				<div className="flex min-h-0 min-w-0 flex-1">
					<div
						className="flex min-h-0 min-w-[320px] flex-1 flex-col overflow-hidden"
						data-workspace-id={workspaceId}
					>
						<Workspace<PaneViewerData>
							key={workspaceId}
							registry={paneRegistry}
							paneActions={defaultPaneActions}
							contextMenuActions={defaultContextMenuActions}
							renderTabIcon={renderBrowserTabIcon}
							renderTabAccessory={(tab) => (
								<V2NotificationStatusIndicator
									sources={getV2NotificationSourcesForTab(tab)}
								/>
							)}
							renderBelowTabBar={() =>
								showPresetsBar ? (
									<V2PresetsBar
										matchedPresets={matchedPresets}
										executePreset={executePreset}
										showPresetsBar={showPresetsBar}
										onToggleShowPresetsBar={setShowPresetsBar}
									/>
								) : null
							}
							renderAddTabMenu={() => (
								<AddTabMenu
									onAddTerminal={addTerminalTab}
									onAddChatV3={addChatV3Tab}
									onAddBrowser={addBrowserTab}
									showPresetsBar={showPresetsBar}
									onToggleShowPresetsBar={setShowPresetsBar}
								/>
							)}
							renderTabBarLeading={
								tabBarHostsChrome
									? () => (
											<div className="flex h-full items-center">
												{isMac && (
													<div
														className="drag h-full shrink-0"
														style={{
															width: `${Math.max(
																80 / zoomFactor -
																	COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
																0,
															)}px`,
														}}
													/>
												)}
												<ZoomStable
													enabled={isMac}
													className="flex items-center gap-1.5 px-1"
												>
													<SidebarToggle />
													<NavigationControls />
												</ZoomStable>
											</div>
										)
									: undefined
							}
							renderTabBarTrailing={() => (
								<div className="flex items-center gap-1">
									{/* The expanded sidebar's header owns the ports pill; the
									    tab bar only hosts it for the collapsed rail, where
									    neither the header cluster nor the TopBar is visible. */}
									{tabBarHostsChrome && <TopBarPortsDropdown />}
									{/* Until the pane layout hydrates, tabs read as empty and
									    every running terminal miscounts as "background", so the
									    button would flash a bogus count on navigation. */}
									{isLayoutReady && (
										<BackgroundTerminalsButton
											workspaceId={workspaceId}
											store={store}
										/>
									)}
									{workspaceRunButton}
									<RightSidebarToggle />
									{!isMac && <WindowControls />}
								</div>
							)}
							renderEmptyState={() => (
								<WorkspaceEmptyState
									onOpenBrowser={addBrowserTab}
									onOpenChatV3={addChatV3Tab}
									onOpenQuickOpen={handleQuickOpen}
									onOpenTerminal={addTerminalTab}
								/>
							)}
							onBeforeCloseTab={onBeforeCloseTab}
							onInteractionStateChange={onWorkspaceInteractionStateChange}
							store={store}
						/>
					</div>
				</div>
				{sidebarOpen &&
					sidebarSlotEl &&
					createPortal(
						<ResizablePanel
							width={sidebarWidth}
							onWidthChange={setRightSidebarWidth}
							isResizing={isSidebarResizing}
							onResizingChange={handleSidebarResizingChange}
							minWidth={240}
							maxWidth={640}
							handleSide="left"
							onDoubleClickHandle={() => setRightSidebarWidth(340)}
						>
							<WorkspaceSidebar
								workspaceId={workspaceId}
								onSelectFile={openFilePaneFromTreeClick}
								onSelectDiffFile={openDiffPane}
								onOpenComment={openCommentPane}
								onSearch={handleQuickOpen}
								selectedFilePath={selectedFilePath}
								pendingReveal={pendingReveal}
							/>
						</ResizablePanel>,
						sidebarSlotEl,
					)}
			</WorkspaceGitStatusProvider>
			<CommandPalette
				workspaceId={workspaceId}
				open={quickOpenOpen}
				onOpenChange={handleQuickOpenChange}
				onSelectFile={handleQuickOpenSelectFile}
				recentlyViewedFiles={recentFiles}
				openFilePaths={openFilePaths}
			/>
		</FileDocumentStoreProvider>
	);
}
