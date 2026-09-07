import {
	createHistory,
	type HistoryLocation,
	type RouterHistory,
} from "@tanstack/react-router";

const STORAGE_KEY = "router-history";
const MAX_ENTRIES = 100;

type LocationState = HistoryLocation["state"];
const NAVIGATION_INTENT = "__desktopNavigationIntent";
type IntentState = LocationState & { [NAVIGATION_INTENT]?: number };

export function getHistoryNavigationIntent(
	location: HistoryLocation,
): number | undefined {
	return (location.state as IntentState)[NAVIGATION_INTENT];
}

interface PersistedState {
	entries: string[];
	index: number;
}

export interface HistoryEntry {
	path: string;
}

function loadPersistedState(): PersistedState {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as PersistedState;
			if (
				Array.isArray(parsed.entries) &&
				parsed.entries.length > 0 &&
				parsed.entries.every((e) => typeof e === "string" && e.length > 0) &&
				typeof parsed.index === "number"
			) {
				const index = Math.min(
					Math.max(parsed.index, 0),
					parsed.entries.length - 1,
				);
				return { entries: parsed.entries, index };
			}
		}
	} catch {}
	return { entries: ["/"], index: 0 };
}

function persistState(entries: string[], index: number) {
	try {
		const capped =
			entries.length > MAX_ENTRIES
				? entries.slice(entries.length - MAX_ENTRIES)
				: entries;
		const cappedIndex =
			entries.length > MAX_ENTRIES
				? Math.max(0, index - (entries.length - MAX_ENTRIES))
				: index;
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ entries: capped, index: cappedIndex }),
		);
	} catch {}
}

function syncHash(path: string) {
	window.history.replaceState(window.history.state, "", `#${path}`);
}

function createRandomKey(): string {
	return (Math.random() + 1).toString(36).substring(7);
}

function assignKeyAndIndex(
	index: number,
	state?: LocationState,
): LocationState {
	const key = createRandomKey();
	return {
		...(state ?? {}),
		key,
		__TSR_key: key,
		__TSR_index: index,
	};
}

function parseHref(href: string, state: LocationState): HistoryLocation {
	const searchIndex = href.indexOf("?");
	const hashIndex = href.indexOf("#");
	return {
		href,
		pathname: href.substring(
			0,
			hashIndex > 0
				? searchIndex > 0
					? Math.min(hashIndex, searchIndex)
					: hashIndex
				: searchIndex > 0
					? searchIndex
					: href.length,
		),
		hash: hashIndex > -1 ? href.substring(hashIndex) : "",
		search:
			searchIndex > -1
				? href.slice(searchIndex, hashIndex === -1 ? undefined : hashIndex)
				: "",
		state,
	};
}

export interface PersistentHashHistory extends RouterHistory {
	getEntries: () => HistoryEntry[];
	setNavigationFilter: (filter: (path: string) => boolean) => () => void;
	getNavigationDelta: (direction: -1 | 1) => number | null;
	canGoForward: () => boolean;
	setNavigationIntentValidator: (
		validator: (intent: number) => boolean,
	) => () => void;
	runWithNavigationIntent: <T>(intent: number, callback: () => T) => T;
}

export function createPersistentHashHistory(): PersistentHashHistory {
	const persisted = loadPersistedState();

	const entries: string[] = [...persisted.entries];
	const states: LocationState[] = entries.map((_entry, i) =>
		assignKeyAndIndex(i),
	);
	let index = persisted.index;
	let navigationFilter: (path: string) => boolean = () => true;
	let activeIntent: number | undefined;
	let validateIntent: (intent: number) => boolean = () => true;
	const canCommit = (state: IntentState) =>
		state[NAVIGATION_INTENT] === undefined ||
		validateIntent(state[NAVIGATION_INTENT]);
	const getNavigationDelta = (direction: -1 | 1): number | null => {
		for (
			let candidate = index + direction;
			candidate >= 0 && candidate < entries.length;
			candidate += direction
		) {
			if (navigationFilter(entries[candidate] ?? "/")) return candidate - index;
		}
		return null;
	};

	const getLocation = () =>
		parseHref(entries[index] ?? "/", states[index] ?? assignKeyAndIndex(index));

	let blockers: Parameters<
		NonNullable<Parameters<typeof createHistory>[0]["setBlockers"]>
	>[0] = [];

	syncHash(entries[index] ?? "/");

	const history = createHistory({
		getLocation,
		getLength: () => entries.length,
		pushState: (path, state) => {
			if (!canCommit(state)) return;
			if (index < entries.length - 1) {
				entries.splice(index + 1);
				states.splice(index + 1);
			}
			entries.push(path);
			states.push(state as LocationState);
			index = entries.length - 1;
			syncHash(path);
			persistState(entries, index);
		},
		replaceState: (path, state) => {
			if (!canCommit(state)) return;
			entries[index] = path;
			states[index] = state as LocationState;
			syncHash(path);
			persistState(entries, index);
		},
		back: () => {
			index += getNavigationDelta(-1) ?? 0;
			syncHash(entries[index] ?? "/");
			persistState(entries, index);
		},
		forward: () => {
			index += getNavigationDelta(1) ?? 0;
			syncHash(entries[index] ?? "/");
			persistState(entries, index);
		},
		go: (n) => {
			const direction = n < 0 ? -1 : 1;
			for (
				let candidate = Math.min(Math.max(index + n, 0), entries.length - 1);
				candidate >= 0 && candidate < entries.length;
				candidate += direction
			) {
				if (navigationFilter(entries[candidate] ?? "/")) {
					index = candidate;
					break;
				}
			}
			syncHash(entries[index] ?? "/");
			persistState(entries, index);
		},
		createHref: (path) =>
			`${window.location.pathname}${window.location.search}#${path}`,
		getBlockers: () => blockers,
		setBlockers: (newBlockers) => {
			blockers = newBlockers;
		},
	});
	const push = history.push;
	const replace = history.replace;
	const withIntent = (state: Parameters<RouterHistory["push"]>[1]) => {
		const next = { ...state } as IntentState;
		if (activeIntent === undefined) delete next[NAVIGATION_INTENT];
		else next[NAVIGATION_INTENT] = activeIntent;
		return next;
	};
	history.push = (path, state, options) =>
		push(path, withIntent(state), options);
	history.replace = (path, state, options) =>
		replace(path, withIntent(state), options);

	return Object.assign(history, {
		setNavigationFilter: (filter: (path: string) => boolean) => {
			navigationFilter = filter;
			return () => {
				if (navigationFilter === filter) navigationFilter = () => true;
			};
		},
		setNavigationIntentValidator: (validator: (intent: number) => boolean) => {
			validateIntent = validator;
			return () => {
				if (validateIntent === validator) validateIntent = () => true;
			};
		},
		runWithNavigationIntent: <T>(intent: number, callback: () => T): T => {
			const previous = activeIntent;
			activeIntent = intent;
			try {
				return callback();
			} finally {
				activeIntent = previous;
			}
		},
		getNavigationDelta,
		canGoBack: () => getNavigationDelta(-1) !== null,
		canGoForward: () => getNavigationDelta(1) !== null,
		getEntries: (): HistoryEntry[] => entries.map((path) => ({ path })),
	});
}

export const persistentHistory = createPersistentHashHistory();
