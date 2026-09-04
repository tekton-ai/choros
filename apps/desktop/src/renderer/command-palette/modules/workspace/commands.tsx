import { msg } from "@lingui/core/macro";
import {
	ArchiveIcon,
	FileIcon,
	PlusIcon,
	Trash2Icon,
	ZapIcon,
} from "lucide-react";
import { useQuickOpenStore } from "renderer/command-palette/ui/quick-open/quick-open-store";
import { useDeleteWorkspaceIntent } from "renderer/stores/delete-workspace-intent";
import { useNewWorkspaceModalStore } from "renderer/stores/new-workspace-modal";
import { useQuickCreateWorkspaceIntent } from "renderer/stores/quick-create-workspace-intent";
import { useRemoveFromSidebarIntent } from "renderer/stores/remove-workspace-from-sidebar-intent";
import type { Command, CommandProvider } from "../../core/types";

export const workspaceProvider: CommandProvider = {
	id: "workspace",
	provide: (context) => {
		// Not gated on context.workspace — quick-create should work from any
		// v2 dashboard view (e.g. the workspaces list), not just an open one.
		const quickCreate: Command = {
			id: "workspace.quickCreate",
			title: msg({
				id: "commandPalette.workspace.quickCreate",
				message: "Quick create workspace",
			}),
			section: "workspace",
			icon: ZapIcon,
			hotkeyId: "QUICK_CREATE_WORKSPACE",
			keywords: ["new", "fast"],
			run: (ctx) =>
				useQuickCreateWorkspaceIntent
					.getState()
					.request(ctx.workspace?.projectId ?? null),
		};

		if (!context.workspace) return [quickCreate];
		const workspace = context.workspace;
		const isMain = workspace.workspaceType === "main";

		const commands: Command[] = [
			{
				id: "workspace.new",
				title: msg({
					id: "commandPalette.workspace.new",
					message: "New workspace",
				}),
				section: "workspace",
				icon: PlusIcon,
				hotkeyId: "NEW_WORKSPACE",
				run: () =>
					useNewWorkspaceModalStore.getState().openModal(workspace.projectId),
			},
			quickCreate,
			{
				id: "files.quickOpen",
				title: msg({
					id: "commandPalette.workspace.searchFiles",
					message: "Search files",
				}),
				section: "workspace",
				icon: FileIcon,
				keywords: ["file picker", "quick open"],
				hotkeyId: "QUICK_OPEN",
				run: () =>
					useQuickOpenStore.getState().openFor({
						workspaceId: workspace.id,
					}),
			},
		];

		if (workspace.projectId) {
			commands.push({
				id: `workspace.removeFromSidebar:${workspace.id}`,
				title: msg({
					id: "commandPalette.workspace.removeFromSidebar",
					message: "Remove from sidebar",
				}),
				section: "workspace",
				icon: ArchiveIcon,
				keywords: ["hide"],
				run: () =>
					useRemoveFromSidebarIntent.getState().request({
						workspaceId: workspace.id,
						workspaceName: workspace.name,
						projectId: workspace.projectId ?? "",
						isMain,
					}),
			});
		}

		if (!isMain) {
			commands.push({
				id: `workspace.delete:${workspace.id}`,
				title: msg({
					id: "commandPalette.workspace.delete",
					message: "Delete workspace",
				}),
				section: "workspace",
				icon: Trash2Icon,
				keywords: ["archive", "remove", "close"],
				hotkeyId: "CLOSE_WORKSPACE",
				run: () =>
					useDeleteWorkspaceIntent.getState().request({
						workspaceId: workspace.id,
						workspaceName: workspace.name,
					}),
			});
		}

		return commands;
	},
};
