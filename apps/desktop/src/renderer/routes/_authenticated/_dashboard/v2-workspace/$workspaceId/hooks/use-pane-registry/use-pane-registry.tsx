import { errorMessage } from "@choros/i18n/errors";
import type {
	ContextMenuActionConfig,
	PaneRegistry,
	RendererContext,
	WorkspaceStore,
} from "@choros/panes";
import { alert } from "@choros/ui/atoms/alert";
import { toast } from "@choros/ui/sonner";
import { cn } from "@choros/ui/utils";
import { workspaceTrpc } from "@choros/workspace-client";
import { Trans, useLingui } from "@lingui/react/macro";
import { Circle, GitCompareArrows, Globe, MessageSquare } from "lucide-react";
import { useCallback, useMemo } from "react";
import {
	LuArrowDownToLine,
	LuClipboard,
	LuClipboardCopy,
	LuEraser,
	LuPower,
} from "react-icons/lu";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { FileIcon } from "renderer/lib/file-icons";
import { getBaseName } from "renderer/lib/path-basename";
import {
	confirmCloseTerminals,
	probeTerminalRunning,
} from "renderer/lib/terminal/confirm-close-terminals";
import { consumeTerminalBackgroundIntent } from "renderer/lib/terminal/terminal-background-intents";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/workspace-provider";
import { useCollections } from "renderer/routes/_authenticated/providers/collections-provider";
import { getV2NotificationSourcesForPane } from "renderer/stores/v2-notifications";
import type { StoreApi } from "zustand/vanilla";
import { V2NotificationStatusIndicator } from "../../components/v2-notification-status-indicator";
import {
	getDocument,
	useSharedFileDocument,
} from "../../state/file-document-store";
import type {
	BrowserPaneData,
	ChatV3PaneData,
	CommentPaneData,
	DevtoolsPaneData,
	FilePaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../types";
import { focusOrAddTerminalPane } from "../../utils/focus-terminal-pane";
import type { TerminalLauncher } from "../use-v2-terminal-launcher";
import { BrowserPane, BrowserPaneToolbar } from "./components/browser-pane";
import { ChatV3Pane } from "./components/chat-v3-pane";
import { CommentPane } from "./components/comment-pane";
import { CommentPaneHeaderExtras } from "./components/comment-pane/components/comment-pane-header-extras";
import { CommentPaneTitle } from "./components/comment-pane/components/comment-pane-title";
import { DiffPane } from "./components/diff-pane";
import { DiffPaneHeaderExtras } from "./components/diff-pane/components/diff-pane-header-extras";
import { FilePane } from "./components/file-pane";
import { FilePaneHeaderExtras } from "./components/file-pane/components/file-pane-header-extras";
import { TerminalPane } from "./components/terminal-pane";
import { TerminalPaneHeaderExtras } from "./components/terminal-pane/components/terminal-pane-header-extras";
import { TerminalPaneIcon } from "./components/terminal-pane/components/terminal-pane-icon";
import { TerminalSessionDropdown } from "./components/terminal-pane/components/terminal-session-dropdown";

function getFileName(filePath: string): string {
	return getBaseName(filePath);
}

function FilePaneTabTitle({
	filePath,
	isActive,
	pinned,
	workspaceId,
}: {
	filePath: string;
	isActive: boolean;
	pinned: boolean;
	workspaceId: string;
}) {
	const document = useSharedFileDocument({
		workspaceId,
		absolutePath: filePath,
	});
	const name = getFileName(filePath);
	return (
		<div
			className={cn(
				"flex min-w-0 items-center gap-1.5 text-xs transition-colors duration-150",
				isActive ? "text-foreground" : "text-muted-foreground",
			)}
			title={filePath}
		>
			<FileIcon fileName={name} className="size-3.5 shrink-0" />
			<span className={cn("min-w-0 truncate", !pinned && "italic")}>
				{name}
			</span>
			{document.dirty && (
				<Circle className="size-2 shrink-0 fill-current text-muted-foreground" />
			)}
		</div>
	);
}

const MOD_KEY = navigator.platform.toLowerCase().includes("mac")
	? "⌘"
	: "Ctrl+";

interface UsePaneRegistryOptions {
	onOpenFile: (path: string, openInNewTab?: boolean) => void;
	onRevealPath: (path: string) => void;
	launcher: TerminalLauncher;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
}

export function usePaneRegistry({
	onOpenFile,
	onRevealPath,
	launcher,
	store,
}: UsePaneRegistryOptions): PaneRegistry<PaneViewerData> {
	const { t } = useLingui();
	const { workspace } = useWorkspace();
	const workspaceId = workspace.id;
	const runAgent = workspaceTrpc.agents.run.useMutation();
	const collections = useCollections();
	const clearShortcut = useHotkeyDisplay("CLEAR_TERMINAL").text;
	const scrollToBottomShortcut = useHotkeyDisplay("SCROLL_TO_BOTTOM").text;
	const workspaceTrpcUtils = workspaceTrpc.useUtils();
	const { mutate: killTerminalSession, isPending: isKillingTerminalSession } =
		workspaceTrpc.terminal.killSession.useMutation({
			onSuccess: () => {
				toast.success(
					t({
						id: "workspace.paneRegistry.sessionKilledToast",
						message: "Terminal session killed",
					}),
				);
				void workspaceTrpcUtils.terminal.list.invalidate({
					workspaceId,
				});
			},
			onError: (error) => {
				toast.error(
					t({
						id: "workspace.paneRegistry.killSessionFailedToast",
						message: "Failed to kill terminal session",
					}),
					{
						description: errorMessage(error),
					},
				);
			},
		});
	// onAfterClose-driven kill: silent on both success and failure, since
	// the user's intent was already expressed by closing the pane.
	const { mutate: killTerminalSessionSilently } =
		workspaceTrpc.terminal.killSession.useMutation({
			onSuccess: () => {
				void workspaceTrpcUtils.terminal.list.invalidate({
					workspaceId,
				});
			},
			onError: (error) => {
				console.warn("Failed to kill removed terminal session", {
					workspaceId,
					error,
				});
			},
		});
	const clearWorkspaceRunTerminal = useMemo(
		() => (terminalId: string) => {
			if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				if (!draft.workspaceRunTerminals?.[terminalId]) return;
				delete draft.workspaceRunTerminals[terminalId];
			});
		},
		[collections.v2WorkspaceLocalState, workspaceId],
	);

	const createNewAgentSession = useCallback(
		async (input: {
			configId: string;
			placement: "split-pane" | "new-tab";
			prompt: string;
			forkSessionId?: string;
		}): Promise<{ terminalId: string } | null> => {
			try {
				// Host pipeline bakes the prompt into the initialCommand using the
				// agent's argv/stdin transport — no follow-up writeInput needed,
				// no bind-wait race vs. the launching shell.
				const result = await runAgent.mutateAsync({
					workspaceId,
					agent: input.configId,
					prompt: input.prompt,
					...(input.forkSessionId
						? { forkSessionId: input.forkSessionId }
						: {}),
				});
				if (result.kind !== "terminal") {
					toast.error(
						t({
							id: "workspace.paneRegistry.notTerminalAgentToast",
							message: "Selected agent isn't a terminal agent",
						}),
					);
					return null;
				}
				const terminalId = result.sessionId;
				const state = store.getState();
				const pane = {
					kind: "terminal" as const,
					titleOverride: result.label,
					data: { terminalId } as TerminalPaneData,
				};
				if (input.placement === "split-pane" && state.activeTabId) {
					state.addPane({ tabId: state.activeTabId, pane });
				} else {
					state.addTab({ panes: [pane] });
				}
				return { terminalId };
			} catch (error) {
				const description = errorMessage(
					error,
					t({
						id: "workspace.paneRegistry.unknownError",
						message: "Unknown error",
					}),
				);
				toast.error(
					t({
						id: "workspace.paneRegistry.startAgentSessionFailedToast",
						message: "Couldn't start agent session",
					}),
					{ description },
				);
				return null;
			}
		},
		[runAgent, store, workspaceId, t],
	);

	const focusAgentTerminal = useCallback(
		(terminalId: string) => {
			focusOrAddTerminalPane(store, terminalId);
		},
		[store],
	);

	return useMemo<PaneRegistry<PaneViewerData>>(
		() => ({
			file: {
				getIcon: (ctx: RendererContext<PaneViewerData>) => {
					const data = ctx.pane.data as FilePaneData;
					const name = getFileName(data.filePath);
					return <FileIcon fileName={name} className="size-4" />;
				},
				getTitle: (pane) => getFileName((pane.data as FilePaneData).filePath),
				renderTitle: (ctx: RendererContext<PaneViewerData>) => {
					const data = ctx.pane.data as FilePaneData;
					return (
						<FilePaneTabTitle
							filePath={data.filePath}
							isActive={ctx.isActive}
							pinned={Boolean(ctx.pane.pinned)}
							workspaceId={workspaceId}
						/>
					);
				},
				renderPane: (ctx: RendererContext<PaneViewerData>) => (
					<FilePane context={ctx} workspaceId={workspaceId} />
				),
				renderHeaderExtras: (ctx: RendererContext<PaneViewerData>) => (
					<FilePaneHeaderExtras context={ctx} workspaceId={workspaceId} />
				),
				onHeaderClick: (ctx: RendererContext<PaneViewerData>) =>
					ctx.actions.pin(),
				onBeforeClose: (pane) => {
					const data = pane.data as FilePaneData;
					const doc = getDocument(workspaceId, data.filePath);
					if (!doc?.dirty) return true;
					const name = getFileName(data.filePath);
					return new Promise<boolean>((resolve) => {
						alert({
							title: t({
								id: "workspace.paneRegistry.saveChangesTitle",
								message: `Do you want to save the changes you made to ${name}?`,
							}),
							description: t({
								id: "workspace.paneRegistry.saveChangesBody",
								message: "Your changes will be lost if you don't save them.",
							}),
							actions: [
								{
									label: t({
										id: "workspace.paneRegistry.save",
										message: "Save",
									}),
									onClick: async () => {
										const doc = getDocument(workspaceId, data.filePath);
										if (!doc) {
											resolve(true);
											return;
										}
										const result = await doc.save();
										// Only proceed to close if the save succeeded; otherwise
										// leave the pane open so the user can see the conflict /
										// error state and retry.
										resolve(result.status === "saved");
									},
								},
								{
									label: t({
										id: "workspace.paneRegistry.dontSave",
										message: "Don't Save",
									}),
									variant: "secondary",
									onClick: async () => {
										const doc = getDocument(workspaceId, data.filePath);
										if (doc) await doc.reload();
										resolve(true);
									},
								},
								{
									label: t({
										id: "workspace.paneRegistry.cancel",
										message: "Cancel",
									}),
									variant: "ghost",
									onClick: () => resolve(false),
								},
							],
						});
					});
				},
				contextMenuActions: (_ctx, defaults) =>
					defaults.map((d) =>
						d.key === "close-pane"
							? {
									...d,
									label: t({
										id: "workspace.paneRegistry.closeFile",
										message: "Close File",
									}),
								}
							: d,
					),
			},
			diff: {
				getIcon: () => <GitCompareArrows className="size-3.5" />,
				getTitle: () =>
					t({ id: "workspace.paneRegistry.changesTitle", message: "Changes" }),
				renderPane: (ctx: RendererContext<PaneViewerData>) => (
					<DiffPane
						context={ctx}
						workspaceId={workspaceId}
						onOpenFile={onOpenFile}
						onCreateNewAgentSession={createNewAgentSession}
					/>
				),
				renderHeaderExtras: () => <DiffPaneHeaderExtras />,
				contextMenuActions: (_ctx, defaults) =>
					defaults.map((d) =>
						d.key === "close-pane"
							? {
									...d,
									label: t({
										id: "workspace.paneRegistry.closeDiff",
										message: "Close Diff",
									}),
								}
							: d,
					),
			},
			terminal: {
				getIcon: (ctx) => {
					const { terminalId } = ctx.pane.data as TerminalPaneData;
					return (
						<TerminalPaneIcon
							workspaceId={workspaceId}
							terminalId={terminalId}
						/>
					);
				},
				getTitle: () =>
					t({
						id: "workspace.paneRegistry.terminalTitle",
						message: "Terminal",
					}),
				titleSource: (pane) => {
					const { terminalId } = pane.data as TerminalPaneData;
					const instanceId = pane.id;
					return {
						subscribe: (callback) =>
							terminalRuntimeRegistry.onTitleChange(
								terminalId,
								callback,
								instanceId,
							),
						getSnapshot: () =>
							terminalRuntimeRegistry
								.getTitle(terminalId, instanceId)
								?.trim() || undefined,
					};
				},
				onBeforeClose: (pane) => {
					const { terminalId } = pane.data as TerminalPaneData;
					return confirmCloseTerminals(
						[terminalId],
						(id) => probeTerminalRunning(workspaceTrpcUtils, workspaceId, id),
						{
							title: t({
								id: "workspace.paneRegistry.terminalRunningTitle",
								message: "A process is still running in this terminal",
							}),
							description: t({
								id: "workspace.paneRegistry.terminalRunningBody",
								message: "Closing this terminal will end the running process.",
							}),
							confirmLabel: t({
								id: "workspace.paneRegistry.closeTerminalConfirm",
								message: "Close terminal",
							}),
						},
					);
				},
				onAfterClose: (pane) => {
					const { terminalId } = pane.data as TerminalPaneData;
					if (consumeTerminalBackgroundIntent(terminalId)) {
						terminalRuntimeRegistry.release(terminalId);
						return;
					}
					clearWorkspaceRunTerminal(terminalId);
					terminalRuntimeRegistry.dispose(terminalId);
					killTerminalSessionSilently({ terminalId, workspaceId });
				},
				renderTitle: (ctx: RendererContext<PaneViewerData>) => (
					<div className="flex min-w-0 flex-1 items-center gap-1.5">
						<TerminalSessionDropdown
							context={ctx}
							launcher={launcher}
							workspaceId={workspaceId}
						/>
						<V2NotificationStatusIndicator
							sources={getV2NotificationSourcesForPane(ctx.pane)}
						/>
					</div>
				),
				renderHeaderExtras: (ctx: RendererContext<PaneViewerData>) => {
					const { terminalId } = ctx.pane.data as TerminalPaneData;
					return (
						<TerminalPaneHeaderExtras
							workspaceId={workspaceId}
							terminalId={terminalId}
							terminalInstanceId={ctx.pane.id}
							onCreateNewAgentSession={createNewAgentSession}
						/>
					);
				},
				renderPane: (ctx: RendererContext<PaneViewerData>) => (
					<TerminalPane
						ctx={ctx}
						workspaceId={workspaceId}
						onOpenFile={onOpenFile}
						onRevealPath={onRevealPath}
					/>
				),
				contextMenuActions: (_ctx, defaults) => {
					const terminalActions: ContextMenuActionConfig<PaneViewerData>[] = [
						{
							key: "copy",
							label: t({ id: "workspace.paneRegistry.copy", message: "Copy" }),
							icon: <LuClipboardCopy />,
							shortcut: `${MOD_KEY}C`,
							disabled: (ctx) => {
								const { terminalId } = ctx.pane.data as TerminalPaneData;
								return !terminalRuntimeRegistry.getSelection(
									terminalId,
									ctx.pane.id,
								);
							},
							onSelect: (ctx) => {
								const { terminalId } = ctx.pane.data as TerminalPaneData;
								const text = terminalRuntimeRegistry.getSelection(
									terminalId,
									ctx.pane.id,
								);
								if (text) navigator.clipboard.writeText(text);
							},
						},
						{
							key: "paste",
							label: t({
								id: "workspace.paneRegistry.paste",
								message: "Paste",
							}),
							icon: <LuClipboard />,
							shortcut: `${MOD_KEY}V`,
							onSelect: async (ctx) => {
								const { terminalId } = ctx.pane.data as TerminalPaneData;
								try {
									const text = await navigator.clipboard.readText();
									if (text) {
										terminalRuntimeRegistry.paste(
											terminalId,
											text,
											ctx.pane.id,
										);
									}
								} catch {
									// Clipboard access denied
								}
							},
						},
						{ key: "sep-terminal-clipboard", type: "separator" },
						{
							key: "clear-terminal",
							label: t({
								id: "workspace.paneRegistry.clearTerminal",
								message: "Clear Terminal",
							}),
							icon: <LuEraser />,
							shortcut:
								clearShortcut !== "Unassigned" ? clearShortcut : undefined,
							onSelect: (ctx) => {
								const { terminalId } = ctx.pane.data as TerminalPaneData;
								terminalRuntimeRegistry.clear(terminalId, ctx.pane.id);
							},
						},
						{
							key: "scroll-to-bottom",
							label: t({
								id: "workspace.paneRegistry.scrollToBottom",
								message: "Scroll to Bottom",
							}),
							icon: <LuArrowDownToLine />,
							shortcut:
								scrollToBottomShortcut !== "Unassigned"
									? scrollToBottomShortcut
									: undefined,
							onSelect: (ctx) => {
								const { terminalId } = ctx.pane.data as TerminalPaneData;
								terminalRuntimeRegistry.scrollToBottom(terminalId, ctx.pane.id);
							},
						},
						{ key: "sep-terminal-defaults", type: "separator" },
					];

					const modifiedDefaults = defaults.map((d) =>
						d.key === "close-pane"
							? {
									...d,
									label: t({
										id: "workspace.paneRegistry.closeTerminal",
										message: "Close Terminal",
									}),
								}
							: d,
					);

					const killAction: ContextMenuActionConfig<PaneViewerData> = {
						key: "kill-terminal-session",
						label: t({
							id: "workspace.paneRegistry.killTerminalSession",
							message: "Kill Terminal Session",
						}),
						icon: <LuPower />,
						variant: "destructive",
						disabled: isKillingTerminalSession,
						onSelect: (ctx) => {
							const { terminalId } = ctx.pane.data as TerminalPaneData;
							killTerminalSession({
								terminalId,
								workspaceId,
							});
						},
					};

					return [
						...terminalActions,
						...modifiedDefaults,
						{ key: "sep-terminal-kill", type: "separator" },
						killAction,
					];
				},
			},
			browser: {
				getIcon: () => <Globe className="size-3.5" />,
				getTitle: (pane) => {
					const data = pane.data as BrowserPaneData;
					if (data.pageTitle) return data.pageTitle;
					if (data.url && data.url !== "about:blank") {
						try {
							return new URL(data.url).host;
						} catch {}
					}
					return t({
						id: "workspace.paneRegistry.browserTitle",
						message: "Browser",
					});
				},
				renderPane: (ctx: RendererContext<PaneViewerData>) => (
					<BrowserPane
						ctx={ctx}
						onCreateNewAgentSession={createNewAgentSession}
						onFocusAgentTerminal={focusAgentTerminal}
					/>
				),
				renderToolbar: (ctx: RendererContext<PaneViewerData>) => (
					<BrowserPaneToolbar ctx={ctx} />
				),
				// Destruction handled by useGlobalBrowserLifecycle for now.
				contextMenuActions: (_ctx, defaults) =>
					defaults.map((d) =>
						d.key === "close-pane"
							? {
									...d,
									label: t({
										id: "workspace.paneRegistry.closeBrowser",
										message: "Close Browser",
									}),
								}
							: d,
					),
			},
			"chat-v3": {
				getIcon: () => <MessageSquare className="size-3.5" />,
				getTitle: () =>
					t({
						id: "workspace.paneRegistry.chatV3Title",
						message: "Chat",
					}),
				renderPane: (ctx: RendererContext<PaneViewerData>) => {
					const data = ctx.pane.data as ChatV3PaneData;
					return (
						<ChatV3Pane
							workspaceId={workspaceId}
							sessionId={data.sessionId}
							onSessionIdChange={(id) =>
								ctx.actions.updateData({ ...data, sessionId: id })
							}
						/>
					);
				},
				contextMenuActions: (_ctx, defaults) =>
					defaults.map((d) =>
						d.key === "close-pane"
							? {
									...d,
									label: t({
										id: "workspace.paneRegistry.closeChat",
										message: "Close Chat",
									}),
								}
							: d,
					),
			},
			comment: {
				getIcon: (ctx: RendererContext<PaneViewerData>) => {
					const data = ctx.pane.data as CommentPaneData;
					if (!data.avatarUrl) {
						return <MessageSquare className="size-3.5" />;
					}
					return (
						<img
							src={data.avatarUrl}
							alt=""
							className="size-3.5 rounded-full"
						/>
					);
				},
				getTitle: (pane) => {
					const data = pane.data as CommentPaneData;
					return data.authorLogin;
				},
				renderTitle: (ctx: RendererContext<PaneViewerData>) => (
					<CommentPaneTitle context={ctx} />
				),
				renderPane: (ctx: RendererContext<PaneViewerData>) => (
					<CommentPane context={ctx} />
				),
				renderHeaderExtras: (ctx: RendererContext<PaneViewerData>) => (
					<CommentPaneHeaderExtras context={ctx} />
				),
				contextMenuActions: (_ctx, defaults) =>
					defaults.map((d) =>
						d.key === "close-pane"
							? {
									...d,
									label: t({
										id: "workspace.paneRegistry.closeComment",
										message: "Close Comment",
									}),
								}
							: d,
					),
			},
			devtools: {
				getTitle: () =>
					t({
						id: "workspace.paneRegistry.devtoolsTitle",
						message: "DevTools",
					}),
				renderPane: (ctx: RendererContext<PaneViewerData>) => {
					const data = ctx.pane.data as DevtoolsPaneData;
					return (
						<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
							<Trans id="workspace.paneRegistry.inspecting">
								Inspecting {data.targetTitle}
							</Trans>
						</div>
					);
				},
			},
		}),
		[
			workspaceId,
			clearWorkspaceRunTerminal,
			clearShortcut,
			scrollToBottomShortcut,
			killTerminalSession,
			killTerminalSessionSilently,
			isKillingTerminalSession,
			launcher,
			onOpenFile,
			onRevealPath,
			createNewAgentSession,
			focusAgentTerminal,
			workspaceTrpcUtils,
			t,
		],
	);
}
