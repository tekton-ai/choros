import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@choros/ui/context-menu";
import { Plural, Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";
import {
	LuArrowRightLeft,
	LuArrowUp,
	LuFolderPlus,
	LuTrash2,
	LuX,
} from "react-icons/lu";
import { useBulkWorkspaceDeleteDialog } from "../../../../hooks/use-bulk-workspace-delete-dialog";
import { useBulkWorkspaceMoveActions } from "../../../../hooks/use-bulk-workspace-move-actions";
import { useDashboardSidebarHoverActions } from "../../../../providers/dashboard-sidebar-hover-provider";
import { useDashboardSidebarSelection } from "../../../../providers/dashboard-sidebar-selection-provider";
import { DashboardSidebarBulkDeleteDialog } from "../../../dashboard-sidebar-bulk-delete-dialog";
import { useWorkspaceBulkMenuScope } from "../workspace-bulk-menu-scope";

interface DashboardSidebarWorkspaceBulkContextMenuProps {
	children: ReactNode;
}

export function DashboardSidebarWorkspaceBulkContextMenu({
	children,
}: DashboardSidebarWorkspaceBulkContextMenuProps) {
	const scope = useWorkspaceBulkMenuScope();
	const { setContextMenuOpen } = useDashboardSidebarHoverActions();
	const { clearSelection, removeSelectedWorkspaces } =
		useDashboardSidebarSelection();
	const {
		createGroupFromSelection,
		groupedWorkspaceIds,
		moveSelectionToSection,
		sectionMenuState,
		sections,
		selectedWorkspaces,
		ungroupSelection,
	} = useBulkWorkspaceMoveActions({
		projectId: scope?.projectId ?? null,
		workspacesById: scope?.workspacesById ?? new Map(),
		sectionIdByWorkspaceId: scope?.sectionIdByWorkspaceId ?? new Map(),
	});
	const { deleteDialogProps, openDeleteDialog } = useBulkWorkspaceDeleteDialog({
		selectedWorkspaces,
		onDeleted: removeSelectedWorkspaces,
	});

	if (!scope) return children;

	const count = selectedWorkspaces.length;

	return (
		<>
			<ContextMenu onOpenChange={setContextMenuOpen}>
				<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
				<ContextMenuContent
					onCloseAutoFocus={(event) => event.preventDefault()}
				>
					<ContextMenuSub>
						<ContextMenuSubTrigger>
							<LuArrowRightLeft className="size-4 mr-2" />
							<Trans id="dashboard.sidebar.workspaceBulkMenu.moveToGroup">
								Move {count} to Group
							</Trans>
						</ContextMenuSubTrigger>
						<ContextMenuSubContent>
							<ContextMenuItem onSelect={createGroupFromSelection}>
								<LuFolderPlus className="size-4 mr-2" />
								<Trans id="dashboard.sidebar.workspaceBulkMenu.newGroup">
									New group
								</Trans>
							</ContextMenuItem>
							{sectionMenuState === "populated" && <ContextMenuSeparator />}
							{sections?.map((section) => (
								<ContextMenuItem
									key={section.id}
									onSelect={() => moveSelectionToSection(section.id)}
								>
									{section.color && (
										<span
											className="size-2 shrink-0 rounded-full mr-2"
											style={{ backgroundColor: section.color }}
										/>
									)}
									{section.name}
								</ContextMenuItem>
							))}
							{sectionMenuState !== "populated" && (
								<ContextMenuItem disabled>
									{sectionMenuState === "empty" ? (
										<Trans id="dashboard.sidebar.workspaceBulkMenu.noGroupsYet">
											No groups yet
										</Trans>
									) : (
										<Trans id="dashboard.sidebar.workspaceBulkMenu.loadingGroups">
											Loading groups…
										</Trans>
									)}
								</ContextMenuItem>
							)}
						</ContextMenuSubContent>
					</ContextMenuSub>
					{groupedWorkspaceIds.length > 0 && (
						<ContextMenuItem onSelect={ungroupSelection}>
							<LuArrowUp className="size-4 mr-2" />
							<Trans id="dashboard.sidebar.workspaceBulkMenu.ungroup">
								Ungroup
							</Trans>
						</ContextMenuItem>
					)}
					<ContextMenuSeparator />
					<ContextMenuItem
						onSelect={openDeleteDialog}
						className="text-destructive focus:text-destructive"
					>
						<LuTrash2 className="size-4 mr-2 text-destructive" />
						<Plural
							id="dashboard.sidebar.workspaceBulkMenu.deleteCount"
							value={count}
							one="Delete # Workspace"
							other="Delete # Workspaces"
						/>
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem onSelect={clearSelection}>
						<LuX className="size-4 mr-2" />
						<Trans id="dashboard.sidebar.workspaceBulkMenu.clearSelection">
							Clear Selection
						</Trans>
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>

			<DashboardSidebarBulkDeleteDialog {...deleteDialogProps} />
		</>
	);
}
