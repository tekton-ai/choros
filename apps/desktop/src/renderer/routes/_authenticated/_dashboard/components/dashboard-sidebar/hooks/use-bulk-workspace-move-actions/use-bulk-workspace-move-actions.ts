import { normalizeWorkspaceTags } from "@choros/shared/workspace-tags";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/use-dashboard-sidebar-state";
import { useOptimisticActions } from "renderer/routes/_authenticated/hooks/use-optimistic-actions";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/host-workspaces-provider";
import {
	applyFolderTagChange,
	mintFolderTag,
} from "renderer/routes/_authenticated/utils/workspace-tag-folders";
import { useDashboardSidebarSectionRename } from "../../components/dashboard-sidebar-section-rename-context";
import { useDashboardSidebarSelection } from "../../providers/dashboard-sidebar-selection-provider";
import type { DashboardSidebarWorkspace } from "../../types";
import { workspaceIdsForSectionMove } from "../../utils/bulk-workspace-actions";
import { useProjectTagFolderSections } from "../use-project-tag-folder-sections";
import { resolveBulkWorkspaceSectionMenuState } from "./bulk-workspace-move-actions";

interface UseBulkWorkspaceMoveActionsOptions {
	projectId: string | null;
	workspacesById: ReadonlyMap<string, DashboardSidebarWorkspace>;
	sectionIdByWorkspaceId: ReadonlyMap<string, string>;
}

/**
 * Provides one cache-first section source and one set of bulk move actions for
 * both the sidebar toolbar and workspace-row context menu.
 */
export function useBulkWorkspaceMoveActions({
	projectId,
	workspacesById,
	sectionIdByWorkspaceId,
}: UseBulkWorkspaceMoveActionsOptions) {
	const { createSection, moveWorkspaceToSection } = useDashboardSidebarState();
	const { v2Workspaces } = useOptimisticActions();
	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	const { requestSectionRename } = useDashboardSidebarSectionRename();
	const { clearSelection, selectedWorkspaceIds } =
		useDashboardSidebarSelection();
	// The derived union — tag-only folders with no stored row are valid
	// bulk-move targets too.
	const { sections, areSectionsReady } = useProjectTagFolderSections(projectId);
	const sectionMenuState = resolveBulkWorkspaceSectionMenuState(
		sections,
		areSectionsReady,
	);
	const selectedWorkspaces = selectedWorkspaceIds.flatMap((workspaceId) => {
		const workspace = workspacesById.get(workspaceId);
		return workspace ? [workspace] : [];
	});
	const selectedIds = selectedWorkspaces.map((workspace) => workspace.id);
	const groupedWorkspaceIds = selectedIds.filter((workspaceId) =>
		sectionIdByWorkspaceId.has(workspaceId),
	);
	const sessionTags = new Set(sections.map((section) => section.id));
	const updateSessionWorkspaceGroup = (
		workspaceId: string,
		tag: string | null,
	) => {
		const workspace = hostWorkspaces.find((item) => item.id === workspaceId);
		void v2Workspaces.updateWorkspace(workspaceId, {
			tags: applyFolderTagChange(
				normalizeWorkspaceTags(workspace?.tags),
				sessionTags,
				tag,
			),
		});
	};

	const moveSelectionToSection = (sectionId: string) => {
		if (projectId === null) {
			for (const workspaceId of workspaceIdsForSectionMove(
				selectedIds,
				sectionIdByWorkspaceId,
				sectionId,
			))
				updateSessionWorkspaceGroup(workspaceId, sectionId);
			clearSelection();
			return;
		}
		for (const workspaceId of workspaceIdsForSectionMove(
			selectedIds,
			sectionIdByWorkspaceId,
			sectionId,
		)) {
			moveWorkspaceToSection(workspaceId, projectId, sectionId);
		}
		clearSelection();
	};

	const createGroupFromSelection = () => {
		if (projectId === null) {
			const tag = mintFolderTag("New group", sessionTags);
			for (const workspaceId of selectedIds)
				updateSessionWorkspaceGroup(workspaceId, tag);
			clearSelection();
			requestSectionRename(`session:${tag}`);
			return;
		}
		const sectionId = createSection(projectId);
		for (const workspaceId of selectedIds) {
			moveWorkspaceToSection(workspaceId, projectId, sectionId);
		}
		clearSelection();
		requestSectionRename(sectionId);
	};

	const ungroupSelection = () => {
		if (projectId === null) {
			for (const workspaceId of [...groupedWorkspaceIds].reverse())
				updateSessionWorkspaceGroup(workspaceId, null);
			clearSelection();
			return;
		}
		// Each move inserts directly below the row's former group, so processing
		// in visual order would stack the rows reversed. Iterate back-to-front to
		// keep the selection's visual order.
		for (const workspaceId of [...groupedWorkspaceIds].reverse()) {
			moveWorkspaceToSection(workspaceId, projectId, null);
		}
		clearSelection();
	};

	return {
		createGroupFromSelection,
		groupedWorkspaceIds,
		moveSelectionToSection,
		sectionMenuState,
		sections,
		selectedWorkspaces,
		ungroupSelection,
	};
}
