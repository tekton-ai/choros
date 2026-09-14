import { Tooltip, TooltipContent, TooltipTrigger } from "@choros/ui/tooltip";
import { useLingui } from "@lingui/react/macro";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";

export function ProfileStepButton({
	direction,
	targetName,
	disabled,
	onClick,
}: {
	direction: -1 | 1;
	targetName: string | undefined;
	disabled: boolean;
	onClick: () => void;
}) {
	const { t } = useLingui();
	const label =
		direction === -1
			? targetName
				? t({
						id: "profiles.switcher.previousWithName",
						message: `Previous Profile: ${targetName}`,
					})
				: t({
						id: "commandPalette.profile.previous",
						message: "Previous Profile",
					})
			: targetName
				? t({
						id: "profiles.switcher.nextWithName",
						message: `Next Profile: ${targetName}`,
					})
				: t({ id: "commandPalette.profile.next", message: "Next Profile" });
	const Icon = direction === -1 ? LuChevronLeft : LuChevronRight;
	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<span className="inline-flex shrink-0">
					<button
						type="button"
						aria-label={label}
						disabled={disabled}
						onClick={onClick}
						className="no-drag flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-fill-selected hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30 motion-safe:transition-colors"
					>
						<Icon className="size-3.5" aria-hidden="true" />
					</button>
				</span>
			</TooltipTrigger>
			<TooltipContent side="bottom" className="motion-reduce:animate-none">
				{label}
			</TooltipContent>
		</Tooltip>
	);
}
