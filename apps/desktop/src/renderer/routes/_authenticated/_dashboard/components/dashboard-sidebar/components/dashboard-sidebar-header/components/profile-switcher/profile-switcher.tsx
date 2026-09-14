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
import { ProfileStepButton } from "./components/profile-step-button";
import { useProfileSwitchFeedback } from "./hooks/use-profile-switch-feedback/use-profile-switch-feedback";
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
	const [tooltipOpen, setTooltipOpen] = useState(false);
	const openingDialog = useRef(false);
	const activeIndex = profiles.findIndex(
		(profile) => profile.id === activeProfileId,
	);
	const active = profiles[activeIndex] ?? profiles[0];
	const hasMultipleProfiles = profiles.length > 1;
	const canNavigate = available && isReady && activeIndex >= 0;
	const previousProfile =
		activeIndex > 0 ? profiles[activeIndex - 1] : undefined;
	const nextProfile = activeIndex >= 0 ? profiles[activeIndex + 1] : undefined;
	const position = formatNumber(Math.max(0, activeIndex) + 1);
	const total = formatNumber(profiles.length);
	const positionLabel = t({
		id: "profiles.switcher.position",
		message: `Profile ${position}/${total}`,
	});
	const swipeDescription = t({
		id: "profiles.switcher.swipeDescription",
		message: "Swipe left or right anywhere in the sidebar to switch Profiles.",
	});
	const { labelRef, showFeedback } = useProfileSwitchFeedback(
		activeProfileId,
		activeIndex,
		isCollapsed,
	);
	const name = active?.name ?? "Default";
	const count = attention.get(activeProfileId) ?? 0;
	const formattedCount = formatNumber(count);
	const selectAdjacent = (direction: -1 | 1) => {
		if (!canNavigate) return;
		const profile = profiles[activeIndex + direction];
		if (profile) selectProfile(profile.id);
	};
	const { consumeClick, ...gesture } = useProfileSwitchGesture(selectAdjacent);
	const accessibleName = t({
		id: "profiles.switcher.label",
		message: `Work Profile: ${name}. Workspaces needing attention: ${formattedCount}.`,
	});
	return (
		<>
			<div
				data-profile-switcher=""
				className={cn(
					isCollapsed
						? "flex flex-col items-center gap-1"
						: "mb-2 rounded-lg bg-fill-hover/60 p-1.5",
				)}
			>
				<div
					className={cn(
						"flex",
						isCollapsed ? "flex-col items-center gap-1" : "items-center gap-2",
					)}
				>
					<DropdownMenu open={open} onOpenChange={setOpen}>
						<Tooltip
							delayDuration={300}
							open={
								!open &&
								!creating &&
								(tooltipOpen || (isCollapsed && showFeedback))
							}
							onOpenChange={setTooltipOpen}
						>
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
											if (
												event.key === "ArrowLeft" ||
												event.key === "ArrowRight"
											) {
												event.preventDefault();
												event.stopPropagation();
												selectAdjacent(event.key === "ArrowRight" ? 1 : -1);
											}
										}}
										style={{ touchAction: "pan-y pinch-zoom" }}
										className={cn(
											"no-drag relative flex min-w-0 items-center gap-2 rounded-md font-semibold text-foreground hover:bg-fill-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors",
											isCollapsed
												? "size-8 shrink-0 justify-center bg-fill-selected text-sm"
												: "h-9 flex-1 px-1.5 text-sm",
										)}
									>
										{isCollapsed ? (
											<span
												ref={labelRef}
												data-profile-name=""
												aria-hidden="true"
											>
												{Array.from(name)[0] ?? <LuFolder className="size-4" />}
											</span>
										) : (
											<span
												ref={labelRef}
												data-profile-name=""
												className="min-w-0 flex-1 truncate text-left"
											>
												{name}
											</span>
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
										{!isCollapsed && (
											<LuChevronDown className="size-3 shrink-0" />
										)}
									</button>
								</DropdownMenuTrigger>
							</TooltipTrigger>
							<TooltipContent
								side={isCollapsed ? "right" : "bottom"}
								className="motion-reduce:animate-none"
							>
								<div className="flex max-w-64 flex-col gap-1">
									<span className="break-words font-medium">{name}</span>
									{hasMultipleProfiles && (
										<>
											<span className="text-xs tabular-nums">
												{positionLabel}
											</span>
											<span className="text-xs">{swipeDescription}</span>
										</>
									)}
								</div>
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
					{hasMultipleProfiles && (
						<output
							data-profile-position=""
							aria-label={positionLabel}
							aria-live="off"
							className={cn(
								"shrink-0 whitespace-nowrap tabular-nums text-muted-foreground",
								isCollapsed ? "text-[10px] leading-none" : "pr-1 text-[10px]",
							)}
						>
							{isCollapsed ? `${position}/${total}` : positionLabel}
						</output>
					)}
				</div>
				{hasMultipleProfiles && !isCollapsed && (
					<div
						data-profile-navigation=""
						className="mt-0.5 flex items-center gap-1"
					>
						<ProfileStepButton
							direction={-1}
							targetName={previousProfile?.name}
							disabled={!canNavigate || !previousProfile}
							onClick={() => selectAdjacent(-1)}
						/>
						<Tooltip delayDuration={300}>
							<TooltipTrigger asChild>
								<p className="min-w-0 flex-1 text-center text-[11px] leading-snug text-muted-foreground">
									<Trans id="profiles.switcher.swipeHint">
										Swipe with two fingers to switch
									</Trans>
								</p>
							</TooltipTrigger>
							<TooltipContent
								side="bottom"
								className="max-w-64 motion-reduce:animate-none"
							>
								{swipeDescription}
							</TooltipContent>
						</Tooltip>
						<ProfileStepButton
							direction={1}
							targetName={nextProfile?.name}
							disabled={!canNavigate || !nextProfile}
							onClick={() => selectAdjacent(1)}
						/>
					</div>
				)}
			</div>
			<output aria-live="polite" aria-atomic="true" className="sr-only">
				{accessibleName} {hasMultipleProfiles ? positionLabel : ""}
			</output>
			<ProfileNameDialog open={creating} onOpenChange={setCreating} />
		</>
	);
}
