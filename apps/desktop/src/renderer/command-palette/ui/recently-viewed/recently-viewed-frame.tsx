import {
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@choros/ui/command";
import { cn } from "@choros/ui/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { LuGitBranch } from "react-icons/lu";
import { useHostProjects } from "renderer/hooks/host-projects/use-host-projects";
import {
	type RecentlyViewedEntry,
	useRecentlyViewed,
} from "renderer/routes/_authenticated/_dashboard/components/navigation-controls/components/history-dropdown/hooks/use-recently-viewed";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/host-workspaces-provider";
import { useFrameStackStore } from "../../core/frames";

export function RecentlyViewedFrame() {
	const { i18n } = useLingui();
	const recentEntries = useRecentlyViewed(20);
	const currentPath = useLocation({ select: (loc) => loc.pathname });
	const setOpen = useFrameStackStore((s) => s.setOpen);
	const navigate = useNavigate();

	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	// Projects are fully local — identity comes from the host fan-out.
	const { projects: hostProjects } = useHostProjects();
	const v2ProjectData = useMemo(
		() =>
			hostProjects.map((project) => ({
				id: project.projectKey,
				name: project.name,
			})),
		[hostProjects],
	);
	const v2WorkspaceData = useMemo(() => {
		const projectNamesById = new Map(
			(v2ProjectData ?? []).map((p) => [p.id, p.name]),
		);
		// Inner join: drop workspaces whose project isn't synced yet (and
		// project-less session workspaces).
		return hostWorkspaces.flatMap((workspace) => {
			if (workspace.projectId === null) return [];
			const projectName = projectNamesById.get(workspace.projectId);
			if (projectName === undefined) return [];
			return [{ id: workspace.id, projectName, branch: workspace.branch }];
		});
	}, [hostWorkspaces, v2ProjectData]);

	const filteredEntries = recentEntries.filter((entry) =>
		v2WorkspaceData.some((workspace) => workspace.id === entry.entityId),
	);

	const navigateTo = (path: string) => {
		void navigate({ to: path });
		setOpen(false);
	};

	return (
		<CommandList>
			<CommandEmpty>
				<Trans id="commandPalette.recentlyViewed.empty">
					Nothing here yet.
				</Trans>
			</CommandEmpty>
			<CommandGroup
				heading={i18n._({
					id: "commandPalette.recentlyViewed.heading",
					message: "Recently Viewed",
				})}
			>
				{filteredEntries.map((entry) => (
					<V2WorkspaceRow
						key={entry.path}
						entry={entry}
						isCurrent={entry.path === currentPath}
						v2WorkspaceData={v2WorkspaceData}
						onSelect={() => navigateTo(entry.path)}
					/>
				))}
			</CommandGroup>
		</CommandList>
	);
}

interface RowProps {
	entry: RecentlyViewedEntry;
	isCurrent: boolean;
	onSelect: () => void;
}

function V2WorkspaceRow({
	entry,
	isCurrent,
	v2WorkspaceData,
	onSelect,
}: RowProps & {
	v2WorkspaceData: { id: string; projectName: string; branch: string }[];
}) {
	const { i18n } = useLingui();
	const ws = v2WorkspaceData.find((w) => w.id === entry.entityId);
	return (
		<CommandItem
			value={`v2-workspace ${entry.entityId} ${ws?.projectName ?? ""} ${ws?.branch ?? ""}`}
			onSelect={onSelect}
			className={cn("gap-2.5", isCurrent && "bg-accent/50")}
		>
			<span className="text-muted-foreground text-xs shrink-0 w-24 text-left line-clamp-1">
				{ws?.projectName ??
					i18n._({
						id: "commandPalette.recentlyViewed.v2WorkspaceFallback",
						message: "Workspace",
					})}
			</span>
			<span className="flex items-center justify-center w-4 shrink-0">
				<LuGitBranch
					className="size-3 text-muted-foreground"
					strokeWidth={1.5}
				/>
			</span>
			<span
				className={cn(
					"truncate text-xs font-normal flex-1 min-w-0",
					!ws && "text-muted-foreground",
				)}
			>
				{ws?.branch ??
					i18n._({
						id: "commandPalette.recentlyViewed.v2BranchUnknown",
						message: "Unknown",
					})}
			</span>
		</CommandItem>
	);
}
