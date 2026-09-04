import { normalizeWorkspaceTag } from "@choros/shared/workspace-tags";
import { type ReactNode, useEffect, useState } from "react";
import { useOptimisticActions } from "renderer/routes/_authenticated/hooks/use-optimistic-actions";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/host-workspaces-provider";
import { applyFolderTagChange } from "renderer/routes/_authenticated/utils/workspace-tag-folders";
import { RenameInput } from "renderer/screens/main/components/workspace-sidebar/rename-input";
import { DashboardSidebarGroupHeader } from "../../../dashboard-sidebar-group-header";
import { DashboardSidebarSectionContextMenu } from "../../../dashboard-sidebar-section/components/dashboard-sidebar-section-context-menu";
import { DashboardSidebarSectionActionsDropdown } from "../../../dashboard-sidebar-section/components/dashboard-sidebar-section-context-menu/components/dashboard-sidebar-section-actions-dropdown";
import { useDashboardSidebarSectionRename } from "../../../dashboard-sidebar-section-rename-context";

interface DashboardSidebarSessionTagGroupProps {
	tag: string;
	isCollapsed: boolean;
	onToggleCollapse: () => void;
	children: ReactNode;
}

/** A derived tag lane inside Sessions, styled like project tag folders. */
export function DashboardSidebarSessionTagGroup({
	tag,
	isCollapsed,
	onToggleCollapse,
	children,
}: DashboardSidebarSessionTagGroupProps) {
	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(tag);
	const { workspaces } = useHostWorkspaces();
	const { v2Workspaces } = useOptimisticActions();
	const { pendingRenameSectionId, clearPendingSectionRename } =
		useDashboardSidebarSectionRename();
	const renameKey = `session:${tag}`;
	useEffect(() => {
		if (pendingRenameSectionId !== renameKey) return;
		setRenameValue(tag);
		setIsRenaming(true);
		clearPendingSectionRename(renameKey);
	}, [pendingRenameSectionId, renameKey, tag, clearPendingSectionRename]);
	const members = workspaces.filter(
		(workspace) =>
			workspace.projectId === null &&
			workspace.tags?.some(
				(workspaceTag) => normalizeWorkspaceTag(workspaceTag) === tag,
			),
	);
	const retagMembers = (nextTag: string | null) => {
		for (const workspace of members) {
			void v2Workspaces.updateWorkspace(workspace.id, {
				tags: applyFolderTagChange(workspace.tags, [tag], nextTag),
			});
		}
	};
	const startRename = () => {
		setRenameValue(tag);
		setIsRenaming(true);
	};
	const submitRename = () => {
		const nextTag = normalizeWorkspaceTag(renameValue);
		setIsRenaming(false);
		if (!nextTag || nextTag === tag) return;
		retagMembers(nextTag);
	};
	const cancelRename = () => {
		setRenameValue(tag);
		setIsRenaming(false);
	};
	const actions = (
		<DashboardSidebarSectionActionsDropdown
			color={null}
			onRename={startRename}
			onDelete={() => retagMembers(null)}
		/>
	);

	return (
		<div>
			<div className="border-l-2 border-border">
				<DashboardSidebarSectionContextMenu
					color={null}
					onRename={startRename}
					onDelete={() => retagMembers(null)}
				>
					<DashboardSidebarGroupHeader
						label={
							isRenaming ? (
								<RenameInput
									value={renameValue}
									onChange={setRenameValue}
									onSubmit={submitRename}
									onCancel={cancelRename}
									className="-ml-1 h-5 w-full min-w-0 border-none bg-transparent px-1 py-0 text-[13px] font-medium text-muted-foreground outline-none"
								/>
							) : (
								<span className="truncate">{tag}</span>
							)
						}
						isCollapsed={isCollapsed}
						isEditing={isRenaming}
						onToggleCollapse={onToggleCollapse}
						actions={actions}
					/>
				</DashboardSidebarSectionContextMenu>
			</div>
			{!isCollapsed && children}
		</div>
	);
}
