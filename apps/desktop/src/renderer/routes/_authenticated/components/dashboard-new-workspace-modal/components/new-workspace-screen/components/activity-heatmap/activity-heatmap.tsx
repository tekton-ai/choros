import {
	formatCompactNumber,
	formatDate,
	formatNumber,
} from "@choros/i18n/format";
import { cn } from "@choros/ui/utils";
import { Trans } from "@lingui/react/macro";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useHostUsageHistory } from "renderer/routes/_authenticated/settings/usage/hooks/use-host-usage-history";
import { HeatmapCell } from "./components/heatmap-cell";
import { LEVEL_CLASSES } from "./constants";
import { useTodayDate } from "./use-today-date";
import { generateHeatmapGrid } from "./utils";

interface ActivityHeatmapProps {
	hostUrl: string | null;
	className?: string;
}

export function ActivityHeatmap({ hostUrl, className }: ActivityHeatmapProps) {
	const today = useTodayDate();
	const containerRef = useRef<HTMLDivElement>(null);
	const [weeksCount, setWeeksCount] = useState(1);

	useLayoutEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const measure = () => {
			const style = getComputedStyle(container);
			// Reserve the card padding, 4px ring gutter and 22px weekday gutter.
			const availableWidth =
				container.clientWidth -
				Number.parseFloat(style.paddingLeft) -
				Number.parseFloat(style.paddingRight) -
				26;
			// A week is 14px wide, separated by 4px. Never stretch the cells.
			setWeeksCount(
				Math.max(1, Math.min(52, Math.floor((availableWidth + 4) / 18))),
			);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(container);
		return () => observer.disconnect();
	}, []);

	// Read once for the largest calendar, rather than rescan logs on every resize.
	const historyQuery = useHostUsageHistory(hostUrl, 364);
	const history = historyQuery.data ?? null;
	const previousDay = useRef(today.getTime());
	const { refetch } = historyQuery;
	useEffect(() => {
		if (previousDay.current === today.getTime()) return;
		previousDay.current = today.getTime();
		if (hostUrl) void refetch();
	}, [today, hostUrl, refetch]);

	const tokenMap = useMemo(() => {
		const map = new Map<string, number>();
		if (history?.buckets) {
			for (const bucket of history.buckets) {
				map.set(bucket.day, bucket.tokens);
			}
		}
		return map;
	}, [history]);

	const { weeks, monthLabels, metrics } = useMemo(() => {
		return generateHeatmapGrid(tokenMap, weeksCount, today);
	}, [tokenMap, weeksCount, today]);

	return (
		<div
			ref={containerRef}
			className={cn(
				"w-full rounded-2xl border border-border/40 bg-card/40 p-4 backdrop-blur-sm transition-all shadow-sm",
				className,
			)}
		>
			{/* Header metrics bar */}
			<div className="flex min-h-8 items-center justify-between gap-4 pb-2">
				<div className="flex flex-wrap items-center gap-6 text-xs text-muted-foreground">
					<div className="flex items-baseline gap-1.5">
						<span className="font-normal text-muted-foreground/80">
							<Trans id="activityHeatmap.activeDays">Active Days</Trans>
						</span>
						<span className="font-semibold text-foreground text-sm">
							{formatNumber(metrics.activeDays)}
						</span>
					</div>

					<div className="flex items-baseline gap-1.5">
						<span className="font-normal text-muted-foreground/80">
							<Trans id="activityHeatmap.currentStreak">Current Streak</Trans>
						</span>
						<span className="font-semibold text-primary text-sm">
							{formatNumber(metrics.currentStreak)}
							<span className="ml-0.5 text-xs font-normal text-muted-foreground">
								<Trans id="activityHeatmap.daysUnit">d</Trans>
							</span>
						</span>
					</div>

					<div className="flex items-baseline gap-1.5">
						<span className="font-normal text-muted-foreground/80">
							<Trans id="activityHeatmap.longestStreak">Longest Streak</Trans>
						</span>
						<span className="font-semibold text-foreground text-sm">
							{formatNumber(metrics.longestStreak)}
							<span className="ml-0.5 text-xs font-normal text-muted-foreground">
								<Trans id="activityHeatmap.daysUnit">d</Trans>
							</span>
						</span>
					</div>

					{metrics.totalTokens > 0 && (
						<div className="hidden sm:flex items-baseline gap-1.5">
							<span className="font-normal text-muted-foreground/80">
								<Trans id="activityHeatmap.totalTokens">Tokens</Trans>
							</span>
							<span className="font-medium text-foreground text-xs">
								{formatCompactNumber(metrics.totalTokens)}
							</span>
						</div>
					)}
				</div>
			</div>

			{/* Heatmap Grid body */}
			<div className="mt-3 flex w-full min-w-0 flex-col gap-2 p-0.5">
				<div className="grid grid-cols-[14px_minmax(0,1fr)] gap-2">
					{/* Day of week labels (S, M, T, W, T, F, S) */}
					<div className="grid grid-rows-7 gap-1 text-[10px] font-medium text-muted-foreground/60 select-none">
						{weeks[0]?.map((cell) => (
							<span
								key={cell.dateKey}
								className="flex size-3.5 items-center justify-center leading-none"
							>
								{formatDate(cell.date, { weekday: "narrow" })}
							</span>
						))}
					</div>

					{/* Weeks grid */}
					<div className="grid grid-flow-col auto-cols-[14px] justify-start gap-1">
						{weeks.map((week) => {
							const weekKey = week[0]?.dateKey ?? "week";
							return (
								<div key={weekKey} className="flex min-w-0 flex-col gap-1">
									{week.map((cell) => (
										<HeatmapCell key={cell.dateKey} cell={cell} />
									))}
								</div>
							);
						})}
					</div>
				</div>

				{/* Month labels and Legend */}
				<div className="flex flex-col gap-3 pt-1 text-[11px] text-muted-foreground/70">
					{/* Month indicators */}
					<div
						className="ml-[22px] grid gap-1 select-none font-medium"
						style={{
							gridTemplateColumns: `repeat(${weeksCount}, 14px)`,
						}}
					>
						{monthLabels.map((m) => (
							<span
								key={`month-${m.weekIndex}-${m.label}`}
								className="whitespace-nowrap"
								style={{ gridColumnStart: m.weekIndex + 1 }}
							>
								{m.label}
							</span>
						))}
					</div>

					{/* Legend */}
					<div className="flex items-center justify-end gap-1.5 select-none text-[10px]">
						<span>
							<Trans id="activityHeatmap.less">Less</Trans>
						</span>
						<div className="flex items-center gap-1">
							{([0, 1, 2, 3, 4] as const).map((level) => (
								<span
									key={level}
									className={cn("size-2.5 rounded-[3px]", LEVEL_CLASSES[level])}
								/>
							))}
						</div>
						<span>
							<Trans id="activityHeatmap.more">More</Trans>
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}
