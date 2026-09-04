import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@choros/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@choros/ui/tooltip";
import { cn } from "@choros/ui/utils";
import { Trans } from "@lingui/react/macro";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { LuGitBranch, LuHistory } from "react-icons/lu";
import { useHostProjects } from "renderer/hooks/host-projects/use-host-projects";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/host-workspaces-provider";
import {
	type RecentlyViewedEntry,
	useRecentlyViewed,
} from "./hooks/use-recently-viewed";

function V2WorkspaceRow({
	entry,
	isCurrent,
	v2WorkspaceData,
	onSelect,
}: {
	entry: RecentlyViewedEntry;
	isCurrent: boolean;
	v2WorkspaceData: {
		id: string;
		projectName: string;
		branch: string;
	}[];
	onSelect: () => void;
}) {
	const ws = v2WorkspaceData.find((w) => w.id === entry.entityId);

	return (
		<DropdownMenuItem
			className={cn("gap-2.5", isCurrent && "bg-accent/50")}
			onSelect={onSelect}
		>
			<span className="text-muted-foreground text-xs shrink-0 w-20 text-left line-clamp-1">
				{ws ? (
					ws.projectName
				) : (
					<Trans id="dashboard.historyDropdown.v2WorkspaceKind">
						Workspace
					</Trans>
				)}
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
				{ws ? (
					ws.branch
				) : (
					<Trans id="dashboard.historyDropdown.unknownBranch">Unknown</Trans>
				)}
			</span>
		</DropdownMenuItem>
	);
}

export function HistoryDropdown() {
	const navigate = useNavigate();
	const recentEntries = useRecentlyViewed(20);
	const currentPath = useLocation({ select: (loc) => loc.pathname });

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

	if (filteredEntries.length === 0) {
		return (
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						type="button"
						disabled
						className="no-drag flex items-center justify-center size-7 rounded-md text-muted-foreground opacity-30"
					>
						<LuHistory className="size-3.5" strokeWidth={1.5} />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<Trans id="dashboard.historyDropdown.tooltipDisabled">
						Recently viewed
					</Trans>
				</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<DropdownMenu>
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="no-drag flex items-center justify-center size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
						>
							<LuHistory className="size-3.5" strokeWidth={1.5} />
						</button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<Trans id="dashboard.historyDropdown.tooltip">Recently viewed</Trans>
				</TooltipContent>
			</Tooltip>
			<DropdownMenuContent align="start" className="w-80">
				<DropdownMenuLabel>
					<Trans id="dashboard.historyDropdown.menuLabel">
						Recently Viewed
					</Trans>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{filteredEntries.map((entry) => (
					<V2WorkspaceRow
						key={entry.path}
						entry={entry}
						isCurrent={entry.path === currentPath}
						v2WorkspaceData={v2WorkspaceData}
						onSelect={() => navigate({ to: entry.path })}
					/>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
