import { cn } from "@choros/ui/utils";
import { CgLaptop } from "react-icons/cg";
import {
	LuGitMerge,
	LuGitPullRequest,
	LuGitPullRequestClosed,
	LuGitPullRequestDraft,
	LuListChecks,
} from "react-icons/lu";
import { RxDot } from "react-icons/rx";
import { AsciiSpinner } from "renderer/screens/main/components/ascii-spinner";
import { StatusIndicator } from "renderer/screens/main/components/status-indicator";
import type { ActivePaneStatus } from "shared/tabs-types";
import type {
	DashboardSidebarWorkspacePullRequest,
	DashboardSidebarWorkspaceType,
} from "../../../../types";

interface DashboardSidebarWorkspaceIconProps {
	workspaceType: DashboardSidebarWorkspaceType;
	isActive: boolean;
	variant: "collapsed" | "expanded";
	workspaceStatus?: ActivePaneStatus | null;
	isCreatePending: boolean;
	pullRequestState?: DashboardSidebarWorkspacePullRequest["state"] | null;
}

const OVERLAY_POSITION = {
	collapsed: "top-1 right-1",
	expanded: "-top-0.5 -right-0.5",
} as const;

const PR_ICON_BY_STATE = {
	open: LuGitPullRequest,
	merged: LuGitMerge,
	closed: LuGitPullRequestClosed,
	draft: LuGitPullRequestDraft,
	queued: LuListChecks,
} as const;

const PR_COLOR_BY_STATE = {
	open: "text-emerald-500",
	merged: "text-purple-500",
	closed: "text-destructive",
	draft: "text-muted-foreground",
	queued: "text-amber-500",
} as const;

export function DashboardSidebarWorkspaceIcon({
	workspaceType,
	isActive,
	variant,
	workspaceStatus = null,
	isCreatePending,
	pullRequestState = null,
}: DashboardSidebarWorkspaceIconProps) {
	const overlayPosition = OVERLAY_POSITION[variant];
	const iconColor = cn(
		"text-muted-foreground",
		isActive ? "opacity-100" : "opacity-80",
	);

	const renderPrimaryIcon = () => {
		if (pullRequestState) {
			const PrIcon = PR_ICON_BY_STATE[pullRequestState];
			return (
				<PrIcon
					className={cn("size-3.5", PR_COLOR_BY_STATE[pullRequestState])}
					strokeWidth={1.75}
				/>
			);
		}

		if (workspaceType === "main") {
			return <CgLaptop className={cn("size-4 transition-colors", iconColor)} />;
		}
		return <RxDot className={cn("size-4 transition-colors", iconColor)} />;
	};

	return (
		<>
			{isCreatePending || workspaceStatus === "working" ? (
				<AsciiSpinner className="text-base" />
			) : (
				renderPrimaryIcon()
			)}
			{workspaceStatus && workspaceStatus !== "working" && (
				<span className={cn("absolute", overlayPosition)}>
					<StatusIndicator status={workspaceStatus} />
				</span>
			)}
		</>
	);
}
