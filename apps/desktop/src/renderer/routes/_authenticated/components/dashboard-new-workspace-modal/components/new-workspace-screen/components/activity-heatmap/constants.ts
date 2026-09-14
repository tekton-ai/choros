import type { HeatmapDayCell } from "./utils";

export const LEVEL_CLASSES: Record<HeatmapDayCell["level"], string> = {
	0: "bg-muted/50",
	1: "bg-blue-200/90 dark:bg-blue-950 dark:border dark:border-blue-800/40",
	2: "bg-blue-400/90 dark:bg-blue-700",
	3: "bg-blue-500",
	4: "bg-blue-600 dark:bg-blue-400",
};
