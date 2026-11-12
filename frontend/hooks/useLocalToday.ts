import { useEffect, useState } from "react";
import { todayLocalISO } from "@/lib/utils/date";

/**
 * The viewer's local date (`YYYY-MM-DD`, todayLocalISO), re-rendering at the
 * next local midnight. Pass it to date-dependent Convex queries: their
 * results are cached per argument set, so the day must be an argument for
 * them to recompute when it changes.
 */
export function useLocalToday(): string {
	const [today, setToday] = useState(todayLocalISO);
	useEffect(() => {
		const now = new Date();
		const nextMidnight = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate() + 1,
		);
		// +1s so the timer never fires a hair before the date flips.
		const timer = setTimeout(
			() => setToday(todayLocalISO()),
			nextMidnight.getTime() - now.getTime() + 1000,
		);
		return () => clearTimeout(timer);
	}, [today]);
	return today;
}
