import { formatDate } from "@choros/i18n/format";

/**
 * Utilities for formatting and computing activity heatmap metrics.
 */

export interface DailyTokenBucket {
	day: string; // "YYYY-MM-DD"
	tokens: number;
}

export interface HeatmapDayCell {
	date: Date;
	dateKey: string; // "YYYY-MM-DD"
	dayOfWeek: number; // 0 = Sunday, ..., 6 = Saturday
	tokens: number;
	level: 0 | 1 | 2 | 3 | 4;
	isFuture: boolean;
	isToday: boolean;
}

export interface HeatmapMetrics {
	activeDays: number;
	currentStreak: number;
	longestStreak: number;
	totalTokens: number;
}

/**
 * Format Date to local "YYYY-MM-DD" string
 */
export function formatLocalDateKey(d: Date): string {
	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

/**
 * Parse "YYYY-MM-DD" in local time
 */
export function parseLocalDateKey(key: string): Date {
	const [year, month, day] = key.split("-").map(Number);
	return new Date(year, (month || 1) - 1, day || 1);
}

/**
 * Fixed daily token scale, including cached tokens.
 * Level 0: 0; Level 1: (0, 100M); Level 2: [100M, 200M);
 * Level 3: [200M, 500M]; Level 4: >500M.
 */
export function calculateTokenLevel(tokens: number): 0 | 1 | 2 | 3 | 4 {
	if (!tokens || tokens <= 0) return 0;
	if (tokens < 100_000_000) return 1;
	if (tokens < 200_000_000) return 2;
	if (tokens <= 500_000_000) return 3;
	return 4;
}

/**
 * Generate grid columns (weeks) anchored dynamically to `referenceDate` (defaults to today).
 * Each column has 7 days (Sunday = index 0 to Saturday = index 6).
 */
export function generateHeatmapGrid(
	tokenMap: Map<string, number>,
	weeksCount = 20,
	referenceDate = new Date(),
): {
	weeks: HeatmapDayCell[][];
	monthLabels: Array<{ label: string; weekIndex: number }>;
	metrics: HeatmapMetrics;
} {
	// Normalize referenceDate to beginning of today
	const today = new Date(
		referenceDate.getFullYear(),
		referenceDate.getMonth(),
		referenceDate.getDate(),
	);
	const todayKey = formatLocalDateKey(today);

	// The current week's end (Saturday of the current week)
	const currentDayOfWeek = today.getDay(); // 0 is Sunday, 6 is Saturday
	const endOfWeek = new Date(today);
	endOfWeek.setDate(today.getDate() + (6 - currentDayOfWeek));

	// Start of the window
	const startOfWeek = new Date(endOfWeek);
	startOfWeek.setDate(endOfWeek.getDate() - (weeksCount * 7 - 1));

	const weeks: HeatmapDayCell[][] = [];
	const monthLabels: Array<{ label: string; weekIndex: number }> = [];
	let lastSeenMonth = -1;

	const cursor = new Date(startOfWeek);

	for (let w = 0; w < weeksCount; w++) {
		const weekCells: HeatmapDayCell[] = [];

		for (let d = 0; d < 7; d++) {
			const date = new Date(cursor);
			const dateKey = formatLocalDateKey(date);
			const isFuture = date.getTime() > today.getTime();
			const isToday = dateKey === todayKey;
			const tokens = isFuture ? 0 : (tokenMap.get(dateKey) ?? 0);
			const level = isFuture ? 0 : calculateTokenLevel(tokens);

			// Track month label at the start of a month or first column
			if (d === 0) {
				const m = date.getMonth();
				if (m !== lastSeenMonth) {
					monthLabels.push({
						label: formatDate(date, { month: "short" }),
						weekIndex: w,
					});
					lastSeenMonth = m;
				}
			}

			weekCells.push({
				date,
				dateKey,
				dayOfWeek: d,
				tokens,
				level,
				isFuture,
				isToday,
			});

			cursor.setDate(cursor.getDate() + 1);
		}

		weeks.push(weekCells);
	}

	// Compute metrics across all history in tokenMap up to today
	let activeDays = 0;
	let totalTokens = 0;

	for (const [dayKey, tokens] of tokenMap.entries()) {
		if (dayKey <= todayKey && tokens > 0) {
			activeDays++;
			totalTokens += tokens;
		}
	}

	// Compute streaks
	let currentStreak = 0;
	let longestStreak = 0;
	let tempStreak = 0;

	// Check if today has tokens, or check starting from yesterday
	const todayTokens = tokenMap.get(todayKey) ?? 0;
	const streakCursor = new Date(today);

	if (todayTokens > 0) {
		// today counted
		while (true) {
			const key = formatLocalDateKey(streakCursor);
			const t = tokenMap.get(key) ?? 0;
			if (t > 0) {
				currentStreak++;
				streakCursor.setDate(streakCursor.getDate() - 1);
			} else {
				break;
			}
		}
	} else {
		// check if streak is alive from yesterday
		streakCursor.setDate(streakCursor.getDate() - 1);
		while (true) {
			const key = formatLocalDateKey(streakCursor);
			const t = tokenMap.get(key) ?? 0;
			if (t > 0) {
				currentStreak++;
				streakCursor.setDate(streakCursor.getDate() - 1);
			} else {
				break;
			}
		}
	}

	// Calculate longest streak by sorting active dates
	const sortedDays = Array.from(tokenMap.keys())
		.filter((k) => k <= todayKey && (tokenMap.get(k) ?? 0) > 0)
		.sort();

	let prevDate: Date | null = null;
	for (const dayKey of sortedDays) {
		const curDate = parseLocalDateKey(dayKey);
		if (!prevDate) {
			tempStreak = 1;
		} else {
			const diffDays = Math.round(
				(curDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24),
			);
			if (diffDays === 1) {
				tempStreak++;
			} else {
				tempStreak = 1;
			}
		}
		if (tempStreak > longestStreak) {
			longestStreak = tempStreak;
		}
		prevDate = curDate;
	}

	return {
		weeks,
		monthLabels,
		metrics: {
			activeDays,
			currentStreak,
			longestStreak,
			totalTokens,
		},
	};
}
