import { formatNumber } from "@choros/i18n/format";
import { Tooltip, TooltipContent, TooltipTrigger } from "@choros/ui/tooltip";
import { cn } from "@choros/ui/utils";
import { Trans } from "@lingui/react/macro";
import { LEVEL_CLASSES } from "../../constants";
import type { HeatmapDayCell } from "../../utils";

export function HeatmapCell({ cell }: { cell: HeatmapDayCell }) {
	const { dateKey, tokens, level, isFuture, isToday } = cell;
	const formattedTokens = formatNumber(tokens);
	return (
		<Tooltip delayDuration={150}>
			<TooltipTrigger asChild>
				<div
					className={cn(
						"size-3.5 shrink-0 rounded-[4px] transition-colors duration-150",
						isFuture
							? "bg-muted/20 border border-dashed border-border/30 opacity-40"
							: LEVEL_CLASSES[level],
						isToday &&
							"ring-1.5 ring-primary/80 ring-offset-1 ring-offset-background",
					)}
				/>
			</TooltipTrigger>
			<TooltipContent side="top" className="text-xs py-1 px-2.5 font-normal">
				<div className="flex flex-col gap-0.5">
					<div className="font-semibold">
						{dateKey}{" "}
						{isToday && <Trans id="activityHeatmap.today">(Today)</Trans>}
					</div>
					<div className="text-muted-foreground text-[11px]">
						{isFuture ? (
							<Trans id="activityHeatmap.futureDate">Upcoming</Trans>
						) : tokens > 0 ? (
							<Trans id="activityHeatmap.tokensUsed">
								{formattedTokens} tokens used
							</Trans>
						) : (
							<Trans id="activityHeatmap.noActivity">No activity</Trans>
						)}
					</div>
				</div>
			</TooltipContent>
		</Tooltip>
	);
}
