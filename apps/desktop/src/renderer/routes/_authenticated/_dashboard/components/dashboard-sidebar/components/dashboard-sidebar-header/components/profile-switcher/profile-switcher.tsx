import { formatNumber } from "@choros/i18n/format";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@choros/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@choros/ui/tooltip";
import { cn } from "@choros/ui/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { useRef, useState } from "react";
import { LuChevronDown, LuFolder, LuPlus, LuSettings } from "react-icons/lu";
import { useProfileAttentionCounts } from "renderer/hooks/host-service/use-v2-notification-status";
import { ProfileNameDialog } from "renderer/routes/_authenticated/components/profile-manager-dialog/components/profile-name-dialog";
import { useProfiles } from "renderer/routes/_authenticated/providers/profile-provider";
import { adjacentProfileId } from "./hooks/use-profile-switch-gesture/profile-switch-gesture";
import { useProfileSwitchGesture } from "./hooks/use-profile-switch-gesture/use-profile-switch-gesture";

export function ProfileSwitcher({
	isCollapsed = false,
}: {
	isCollapsed?: boolean;
}) {
	const { t } = useLingui();
	const {
		profiles,
		activeProfileId,
		available,
		isReady,
		selectProfile,
		openManager,
	} = useProfiles();
	const attention = useProfileAttentionCounts();
	const [open, setOpen] = useState(false);
	const [creating, setCreating] = useState(false);
	const openingDialog = useRef(false);
	const active =
		profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0];
	const name = active?.name ?? "Default";
	const count = attention.get(activeProfileId) ?? 0;
	const formattedCount = formatNumber(count);
	const selectAdjacent = (direction: -1 | 1) => {
		if (!available || !isReady) return;
		const profileId = adjacentProfileId(
			profiles.map((profile) => profile.id),
			activeProfileId,
			direction,
		);
		if (profileId) selectProfile(profileId);
	};
	const { consumeClick, ...gesture } = useProfileSwitchGesture(selectAdjacent);
	const accessibleName = t({
		id: "profiles.switcher.label",
		message: `Work Profile: ${name}. Workspaces needing attention: ${formattedCount}.`,
	});
	return (
		<>
			<DropdownMenu open={open} onOpenChange={setOpen}>
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>
							<button
								{...gesture}
								type="button"
								aria-label={accessibleName}
								onClick={() => {
									if (!consumeClick()) setOpen((value) => !value);
								}}
								onKeyDown={(event) => {
									if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
										event.preventDefault();
										event.stopPropagation();
										selectAdjacent(event.key === "ArrowRight" ? 1 : -1);
									}
								}}
								style={{ touchAction: "pan-y pinch-zoom" }}
								className={cn(
									"no-drag relative flex h-7 shrink-0 items-center gap-2 rounded-md text-[13px] font-medium text-muted-foreground hover:bg-fill-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors",
									isCollapsed ? "w-7 justify-center" : "mb-1 w-full px-2",
								)}
							>
								{isCollapsed ? (
									<span aria-hidden="true">
										{Array.from(name)[0] ?? <LuFolder className="size-4" />}
									</span>
								) : (
									<>
										<LuFolder className="size-4 shrink-0" />
										<span className="min-w-0 flex-1 truncate text-left">
											{name}
										</span>
									</>
								)}
								{count > 0 &&
									(isCollapsed ? (
										<span
											aria-hidden="true"
											className="absolute right-0 top-0 size-1.5 rounded-full bg-destructive"
										/>
									) : (
										<span
											aria-hidden="true"
											className="rounded bg-fill-selected px-1 text-xs tabular-nums"
										>
											{formattedCount}
										</span>
									))}
								{!isCollapsed && <LuChevronDown className="size-3 shrink-0" />}
							</button>
						</DropdownMenuTrigger>
					</TooltipTrigger>
					<TooltipContent side={isCollapsed ? "right" : "bottom"}>
						{accessibleName}
					</TooltipContent>
				</Tooltip>
				<DropdownMenuContent
					align="start"
					side={isCollapsed ? "right" : "bottom"}
					className="w-64 max-h-96 overflow-y-auto motion-reduce:animate-none"
					onCloseAutoFocus={(event) => {
						if (openingDialog.current) event.preventDefault();
						openingDialog.current = false;
					}}
				>
					<DropdownMenuRadioGroup
						value={activeProfileId}
						onValueChange={selectProfile}
					>
						{profiles.map((profile) => {
							const profileCount = attention.get(profile.id) ?? 0;
							const formattedProfileCount = formatNumber(profileCount);
							return (
								<DropdownMenuRadioItem
									key={profile.id}
									value={profile.id}
									disabled={!available || !isReady}
									title={profile.name}
									className="gap-2"
									aria-label={t({
										id: "profiles.switcher.itemLabel",
										message: `${profile.name}. Workspaces needing attention: ${formattedProfileCount}.`,
									})}
								>
									<span className="min-w-0 flex-1 truncate">
										{profile.name}
									</span>
									{profileCount > 0 && (
										<span className="text-xs tabular-nums text-muted-foreground">
											{formattedProfileCount}
										</span>
									)}
								</DropdownMenuRadioItem>
							);
						})}
					</DropdownMenuRadioGroup>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						disabled={!available || !isReady}
						onSelect={() => {
							openingDialog.current = true;
							setCreating(true);
						}}
					>
						<LuPlus className="size-4" />
						<Trans id="profiles.switcher.new">New Profile</Trans>
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => {
							openingDialog.current = true;
							openManager();
						}}
					>
						<LuSettings className="size-4" />
						<Trans id="profiles.switcher.manage">Manage Profiles</Trans>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<output aria-live="polite" aria-atomic="true" className="sr-only">
				{accessibleName}
			</output>
			<ProfileNameDialog open={creating} onOpenChange={setCreating} />
		</>
	);
}
