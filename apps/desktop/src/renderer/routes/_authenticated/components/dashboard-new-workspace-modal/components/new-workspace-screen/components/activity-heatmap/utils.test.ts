import { describe, expect, it } from "bun:test";
import {
	calculateTokenLevel,
	formatLocalDateKey,
	generateHeatmapGrid,
	parseLocalDateKey,
} from "./utils";

describe("activity-heatmap utils", () => {
	it("formats and parses local date key correctly", () => {
		const date = new Date(2026, 8, 14); // Sep 14, 2026
		const key = formatLocalDateKey(date);
		expect(key).toBe("2026-09-14");

		const parsed = parseLocalDateKey("2026-09-14");
		expect(parsed.getFullYear()).toBe(2026);
		expect(parsed.getMonth()).toBe(8);
		expect(parsed.getDate()).toBe(14);
	});

	it("assigns exact threshold boundaries without promoting 500M to level four", () => {
		expect(calculateTokenLevel(0)).toBe(0);
		expect(calculateTokenLevel(1)).toBe(1);
		expect(calculateTokenLevel(99_999_999)).toBe(1);
		expect(calculateTokenLevel(100_000_000)).toBe(2);
		expect(calculateTokenLevel(199_999_999)).toBe(2);
		expect(calculateTokenLevel(200_000_000)).toBe(3);
		expect(calculateTokenLevel(500_000_000)).toBe(3);
		expect(calculateTokenLevel(500_000_001)).toBe(4);
	});

	it("generates heatmap grid and dynamically tracks current and longest streaks", () => {
		const tokenMap = new Map<string, number>([
			["2026-09-12", 15_000],
			["2026-09-13", 45_000],
			["2026-09-14", 120_000],
		]);

		const referenceDate = new Date(2026, 8, 14); // Today is Sep 14, 2026
		const result = generateHeatmapGrid(tokenMap, 15, referenceDate);

		expect(result.weeks.length).toBe(15);
		expect(result.metrics.activeDays).toBe(3);
		expect(result.metrics.totalTokens).toBe(180_000);
		expect(result.metrics.currentStreak).toBe(3);
		expect(result.metrics.longestStreak).toBe(3);

		// Find today's cell
		const allCells = result.weeks.flat();
		const todayCell = allCells.find((c) => c.dateKey === "2026-09-14");
		expect(todayCell).toBeDefined();
		expect(todayCell?.isToday).toBe(true);
		expect(todayCell?.tokens).toBe(120_000);
		expect(todayCell?.level).toBe(1);

		// Verify tomorrow is marked as future
		const tomorrowCell = allCells.find((c) => c.dateKey === "2026-09-15");
		expect(tomorrowCell).toBeDefined();
		expect(tomorrowCell?.isFuture).toBe(true);
		expect(tomorrowCell?.tokens).toBe(0);
	});

	it("recalculates streaks dynamically when referenceDate rolls over to next day", () => {
		const tokenMap = new Map<string, number>([
			["2026-09-13", 45_000],
			["2026-09-14", 120_000],
		]);

		// When reference date is Sep 14:
		const day1Result = generateHeatmapGrid(tokenMap, 15, new Date(2026, 8, 14));
		expect(day1Result.metrics.currentStreak).toBe(2);

		// When clock rolls over to Sep 15 (no tokens yet today):
		const day2Result = generateHeatmapGrid(tokenMap, 15, new Date(2026, 8, 15));
		// Streak is still retained from yesterday:
		expect(day2Result.metrics.currentStreak).toBe(2);

		// When clock rolls over to Sep 16 without any tokens on Sep 15:
		const day3Result = generateHeatmapGrid(tokenMap, 15, new Date(2026, 8, 16));
		// Streak resets because neither today (Sep 16) nor yesterday (Sep 15) had activity:
		expect(day3Result.metrics.currentStreak).toBe(0);
	});
});
