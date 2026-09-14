import { useEffect, useState } from "react";

/**
 * Returns a reactive Date object representing "today" at 00:00:00.
 * Automatically updates when the calendar day rolls over midnight.
 */
export function useTodayDate(): Date {
	const [today, setToday] = useState<Date>(() => {
		const now = new Date();
		return new Date(now.getFullYear(), now.getMonth(), now.getDate());
	});

	useEffect(() => {
		let timer: number;

		const scheduleNextMidnight = () => {
			window.clearTimeout(timer);
			const now = new Date();
			const midnight = new Date(
				now.getFullYear(),
				now.getMonth(),
				now.getDate(),
			);
			setToday((previous) =>
				previous.getTime() === midnight.getTime() ? previous : midnight,
			);
			const tomorrow = new Date(
				now.getFullYear(),
				now.getMonth(),
				now.getDate() + 1,
				0,
				0,
				1,
			);
			const delay = Math.max(1000, tomorrow.getTime() - now.getTime());

			timer = window.setTimeout(scheduleNextMidnight, delay);
		};

		const onVisible = () => {
			if (document.visibilityState === "visible") scheduleNextMidnight();
		};
		scheduleNextMidnight();
		window.addEventListener("focus", scheduleNextMidnight);
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			window.clearTimeout(timer);
			window.removeEventListener("focus", scheduleNextMidnight);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, []);

	return today;
}
