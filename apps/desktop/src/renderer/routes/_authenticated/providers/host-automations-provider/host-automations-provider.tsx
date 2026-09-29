import type {
	Automation,
	AutomationCapabilities,
	AutomationDefinition,
	AutomationPreview,
	AutomationRun,
} from "@choros/shared/automation-contracts";
import { useLingui } from "@lingui/react/macro";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useHostProjects } from "renderer/hooks/host-projects/use-host-projects";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/host-workspaces-provider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/local-host-service-provider";
import { useProfiles } from "renderer/routes/_authenticated/providers/profile-provider";
import { type HostPage, readPageWindow } from "./utils/read-page-window";

const PAGE_SIZE = 100;
const EVENT_POLL_MS = 2_000;
const ATTENTION_STATUSES = ["waiting", "needs_result", "unknown"] as const;
const MONITORED_STATUSES = [
	"preparing",
	"running",
	"waiting",
	"stopping",
	"unknown",
	"needs_result",
] as const;

interface AutomationOwnership {
	profileId: string | null;
	targetAvailable: boolean;
}

interface HostAutomationsContextValue {
	capabilities: AutomationCapabilities | null;
	automations: Automation[];
	runs: AutomationRun[];
	attentionRuns: AutomationRun[];
	hasMoreAutomations: boolean;
	hasMoreRuns: boolean;
	isLoadingMoreAutomations: boolean;
	isLoadingMoreRuns: boolean;
	isLoading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
	loadMoreAutomations: () => Promise<void>;
	loadMoreRuns: () => Promise<void>;
	ownershipFor: (
		automation: Pick<Automation, "definition">,
	) => AutomationOwnership;
	getRun: (id: string) => Promise<AutomationRun>;
	getAutomation: (id: string) => Promise<Automation>;
	preview: (
		definition: AutomationDefinition,
		options?: {
			automationId?: string;
			expectedVersion?: number;
			intent?: "save" | "enable" | "run";
		},
	) => Promise<AutomationPreview>;
	create: (
		confirmationToken: string,
		runImmediately: boolean,
	) => Promise<{ automation: Automation; run?: AutomationRun }>;
	update: (automation: Automation, confirmationToken: string) => Promise<void>;
	setScheduleState: (
		automation: Automation,
		state: "enabled" | "paused",
		confirmationToken?: string,
		resumeAt?: string | null,
	) => Promise<void>;
	archive: (automation: Automation) => Promise<void>;
	runNow: (automation: Automation) => Promise<AutomationRun>;
	retryRun: (run: AutomationRun) => Promise<AutomationRun>;
	requestCancel: (run: AutomationRun) => Promise<AutomationRun>;
	answerInput: (
		run: AutomationRun,
		inputId: string,
		expectedVersion: number,
		answer: string,
	) => Promise<AutomationRun>;
}

const HostAutomationsContext =
	createContext<HostAutomationsContextValue | null>(null);

function requestId(): string {
	return crypto.randomUUID();
}

async function readAllPages<T>(
	load: (cursor?: string) => Promise<HostPage<T>>,
): Promise<{ items: T[]; cursor: number }> {
	const items: T[] = [];
	let nextCursor: string | undefined;
	let snapshotCursor: number | null = null;
	do {
		const result = await load(nextCursor);
		items.push(...result.items);
		snapshotCursor =
			snapshotCursor === null
				? result.cursor
				: Math.min(snapshotCursor, result.cursor);
		nextCursor = result.nextCursor ?? undefined;
	} while (nextCursor);
	return { items, cursor: snapshotCursor ?? 0 };
}

function mergeById<T extends { id: string }>(
	preferred: readonly T[],
	retained: readonly T[],
): T[] {
	const merged = new Map(retained.map((item) => [item.id, item]));
	for (const item of preferred) merged.set(item.id, item);
	return [...merged.values()];
}

function updateExistingById<T extends { id: string }>(
	loaded: readonly T[],
	changed: readonly T[],
): T[] {
	const changes = new Map(changed.map((item) => [item.id, item]));
	return loaded.map((item) => changes.get(item.id) ?? item);
}

function runCanEnterWindow(
	run: AutomationRun,
	loaded: readonly AutomationRun[],
	nextCursor: string | null,
): boolean {
	if (loaded.some((item) => item.id === run.id)) return false;
	if (nextCursor === null) return true;
	const last = loaded.at(-1);
	return (
		!last ||
		run.createdAt > last.createdAt ||
		(run.createdAt === last.createdAt && run.id > last.id)
	);
}

function automationCanEnterWindow(
	automation: Automation,
	loaded: readonly Automation[],
	nextCursor: string | null,
): boolean {
	const existing = loaded.find((item) => item.id === automation.id);
	if (existing) return existing.updatedAt !== automation.updatedAt;
	if (nextCursor === null) return true;
	const last = loaded.at(-1);
	return (
		!last ||
		automation.updatedAt > last.updatedAt ||
		(automation.updatedAt === last.updatedAt && automation.id > last.id)
	);
}

function sortRuns(runs: AutomationRun[]): AutomationRun[] {
	return runs.sort(
		(left, right) =>
			right.createdAt.localeCompare(left.createdAt) ||
			right.id.localeCompare(left.id),
	);
}

function sortAutomations(automations: Automation[]): Automation[] {
	return automations.sort(
		(left, right) =>
			right.updatedAt.localeCompare(left.updatedAt) ||
			right.id.localeCompare(left.id),
	);
}

function isMonitoredRun(run: AutomationRun): boolean {
	return (MONITORED_STATUSES as readonly string[]).includes(run.status);
}

function isAttentionRun(run: AutomationRun): boolean {
	return (ATTENTION_STATUSES as readonly string[]).includes(run.status);
}

function runNeedsNativeNotification(run: AutomationRun): boolean {
	return ["waiting", "needs_result", "succeeded", "failed", "unknown"].includes(
		run.status,
	);
}

export function HostAutomationsProvider({ children }: { children: ReactNode }) {
	const { t } = useLingui();
	const { activeHostUrl } = useLocalHostService();
	const profiles = useProfiles();
	const { workspaces } = useHostWorkspaces();
	const { projects } = useHostProjects();
	const electronUtils = electronTrpc.useUtils();
	const [capabilities, setCapabilities] =
		useState<AutomationCapabilities | null>(null);
	const [automations, setAutomations] = useState<Automation[]>([]);
	const [runs, setRuns] = useState<AutomationRun[]>([]);
	const [monitoredRuns, setMonitoredRuns] = useState<AutomationRun[]>([]);
	const [automationNextCursor, setAutomationNextCursor] = useState<
		string | null
	>(null);
	const [runNextCursor, setRunNextCursor] = useState<string | null>(null);
	const [isLoadingMoreAutomations, setIsLoadingMoreAutomations] =
		useState(false);
	const [isLoadingMoreRuns, setIsLoadingMoreRuns] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const cursorRef = useRef(0);
	const loadedRef = useRef(false);
	const hostGenerationRef = useRef(0);
	const activeHostUrlRef = useRef(activeHostUrl);
	const automationsRef = useRef<Automation[]>([]);
	const runsRef = useRef<AutomationRun[]>([]);
	const monitoredRunsRef = useRef<AutomationRun[]>([]);
	const trackedRunsRef = useRef<AutomationRun[]>([]);
	const automationNextCursorRef = useRef<string | null>(null);
	const runNextCursorRef = useRef<string | null>(null);
	const loadedAutomationPagesRef = useRef(1);
	const loadedRunPagesRef = useRef(1);
	const loadingMoreAutomationsRef = useRef(false);
	const loadingMoreRunsRef = useRef(false);
	const automationWindowRevisionRef = useRef(0);
	const runWindowRevisionRef = useRef(0);
	activeHostUrlRef.current = activeHostUrl;

	const notifyRunChanges = useCallback(
		(previous: readonly AutomationRun[], next: readonly AutomationRun[]) => {
			if (!loadedRef.current) return;
			const previousById = new Map(previous.map((run) => [run.id, run.status]));
			for (const run of next) {
				if (
					previousById.get(run.id) === run.status ||
					!runNeedsNativeNotification(run)
				)
					continue;
				const target = run.definition.target;
				const workspace =
					target.kind === "existingWorkspace"
						? workspaces.find(
								(candidate) => candidate.id === target.workspaceId,
							)
						: undefined;
				const profileId =
					target.kind === "newWorktree"
						? projects.some(
								(project) => project.projectKey === target.projectId,
							)
							? profiles.getProjectProfileId(target.projectId)
							: undefined
						: workspace
							? profiles.getWorkspaceProfileId(workspace)
							: undefined;
				const waiting =
					run.status === "waiting" || run.status === "needs_result";
				const failed = run.status === "failed" || run.status === "unknown";
				void electronUtils.client.notifications.showNative.mutate({
					title: waiting
						? t({
								id: "automations.notification.attentionTitle",
								message: "Automation needs attention",
							})
						: failed
							? t({
									id: "automations.notification.failedTitle",
									message: "Automation run needs review",
								})
							: t({
									id: "automations.notification.completeTitle",
									message: "Automation run complete",
								}),
					body: run.definition.name,
					silent: true,
					clickTarget: {
						runId: run.id,
						...(profileId ? { profileId } : {}),
					},
				});
			}
		},
		[
			electronUtils.client.notifications.showNative,
			profiles,
			projects,
			t,
			workspaces,
		],
	);
	const notifyRunChangesRef = useRef(notifyRunChanges);
	notifyRunChangesRef.current = notifyRunChanges;

	const refresh = useCallback(async () => {
		const hostUrl = activeHostUrl;
		const generation = hostGenerationRef.current;
		const automationPageCount = loadedAutomationPagesRef.current;
		const runPageCount = loadedRunPagesRef.current;
		const automationWindowRevision = automationWindowRevisionRef.current;
		const runWindowRevision = runWindowRevisionRef.current;
		if (!hostUrl) {
			setError(
				t({
					id: "automations.error.hostUnavailable",
					message: "The local Host service is unavailable.",
				}),
			);
			setIsLoading(false);
			return;
		}
		const client = getHostServiceClientByUrl(hostUrl);
		try {
			const [nextCapabilities, automationPage, runPage, monitoredPages] =
				await Promise.all([
					client.automations.capabilities.query(),
					readPageWindow(
						(cursor) =>
							client.automations.list.query({ limit: PAGE_SIZE, cursor }),
						automationPageCount,
					),
					readPageWindow(
						(cursor) =>
							client.automations.listRuns.query({ limit: PAGE_SIZE, cursor }),
						runPageCount,
					),
					Promise.all(
						MONITORED_STATUSES.map((status) =>
							readAllPages((cursor) =>
								client.automations.listRuns.query({
									status,
									limit: PAGE_SIZE,
									cursor,
								}),
							),
						),
					),
				]);
			if (
				activeHostUrlRef.current !== hostUrl ||
				hostGenerationRef.current !== generation ||
				automationWindowRevisionRef.current !== automationWindowRevision ||
				runWindowRevisionRef.current !== runWindowRevision
			)
				return;
			const nextAutomations = automationPage.items;
			const nextRuns = runPage.items;
			const nextMonitoredRuns = sortRuns(
				mergeById(
					monitoredPages.flatMap((page) => page.items),
					[],
				),
			);
			const nextTrackedRuns = sortRuns(mergeById(nextMonitoredRuns, nextRuns));
			const previousTrackedRuns = trackedRunsRef.current;
			automationWindowRevisionRef.current += 1;
			runWindowRevisionRef.current += 1;
			setCapabilities(nextCapabilities);
			setAutomations(nextAutomations);
			setRuns(nextRuns);
			setMonitoredRuns(nextMonitoredRuns);
			automationsRef.current = nextAutomations;
			runsRef.current = nextRuns;
			monitoredRunsRef.current = nextMonitoredRuns;
			trackedRunsRef.current = nextTrackedRuns;
			automationNextCursorRef.current = automationPage.nextCursor;
			setAutomationNextCursor(automationPage.nextCursor);
			runNextCursorRef.current = runPage.nextCursor;
			setRunNextCursor(runPage.nextCursor);
			cursorRef.current = Math.min(
				automationPage.cursor,
				runPage.cursor,
				...monitoredPages.map((page) => page.cursor),
			);
			setError(null);
			notifyRunChangesRef.current(previousTrackedRuns, nextTrackedRuns);
			loadedRef.current = true;
		} catch (cause) {
			if (
				activeHostUrlRef.current === hostUrl &&
				hostGenerationRef.current === generation
			)
				setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			if (
				activeHostUrlRef.current === hostUrl &&
				hostGenerationRef.current === generation
			)
				setIsLoading(false);
		}
	}, [activeHostUrl, t]);

	const loadMoreAutomations = useCallback(async () => {
		const hostUrl = activeHostUrl;
		const generation = hostGenerationRef.current;
		const windowRevision = automationWindowRevisionRef.current;
		const cursor = automationNextCursorRef.current;
		if (!hostUrl || !cursor || loadingMoreAutomationsRef.current) return;
		loadingMoreAutomationsRef.current = true;
		setIsLoadingMoreAutomations(true);
		try {
			const page = await getHostServiceClientByUrl(
				hostUrl,
			).automations.list.query({ limit: PAGE_SIZE, cursor });
			if (
				activeHostUrlRef.current !== hostUrl ||
				hostGenerationRef.current !== generation ||
				automationWindowRevisionRef.current !== windowRevision
			)
				return;
			const next = sortAutomations(
				mergeById(page.items, automationsRef.current),
			);
			automationWindowRevisionRef.current += 1;
			automationsRef.current = next;
			setAutomations(next);
			loadedAutomationPagesRef.current += 1;
			automationNextCursorRef.current = page.nextCursor;
			setAutomationNextCursor(page.nextCursor);
		} catch (cause) {
			if (
				activeHostUrlRef.current === hostUrl &&
				hostGenerationRef.current === generation
			)
				setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			if (
				activeHostUrlRef.current === hostUrl &&
				hostGenerationRef.current === generation
			) {
				loadingMoreAutomationsRef.current = false;
				setIsLoadingMoreAutomations(false);
			}
		}
	}, [activeHostUrl]);

	const loadMoreRuns = useCallback(async () => {
		const hostUrl = activeHostUrl;
		const generation = hostGenerationRef.current;
		const windowRevision = runWindowRevisionRef.current;
		const cursor = runNextCursorRef.current;
		if (!hostUrl || !cursor || loadingMoreRunsRef.current) return;
		loadingMoreRunsRef.current = true;
		setIsLoadingMoreRuns(true);
		try {
			const page = await getHostServiceClientByUrl(
				hostUrl,
			).automations.listRuns.query({ limit: PAGE_SIZE, cursor });
			if (
				activeHostUrlRef.current !== hostUrl ||
				hostGenerationRef.current !== generation ||
				runWindowRevisionRef.current !== windowRevision
			)
				return;
			const next = sortRuns(mergeById(page.items, runsRef.current));
			runWindowRevisionRef.current += 1;
			runsRef.current = next;
			setRuns(next);
			loadedRunPagesRef.current += 1;
			runNextCursorRef.current = page.nextCursor;
			setRunNextCursor(page.nextCursor);
			trackedRunsRef.current = sortRuns(
				mergeById(monitoredRunsRef.current, next),
			);
		} catch (cause) {
			if (
				activeHostUrlRef.current === hostUrl &&
				hostGenerationRef.current === generation
			)
				setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			if (
				activeHostUrlRef.current === hostUrl &&
				hostGenerationRef.current === generation
			) {
				loadingMoreRunsRef.current = false;
				setIsLoadingMoreRuns(false);
			}
		}
	}, [activeHostUrl]);

	useEffect(() => {
		hostGenerationRef.current += 1;
		automationWindowRevisionRef.current += 1;
		runWindowRevisionRef.current += 1;
		loadedRef.current = false;
		cursorRef.current = 0;
		automationsRef.current = [];
		runsRef.current = [];
		monitoredRunsRef.current = [];
		trackedRunsRef.current = [];
		loadedAutomationPagesRef.current = 1;
		loadedRunPagesRef.current = 1;
		automationNextCursorRef.current = null;
		runNextCursorRef.current = null;
		loadingMoreAutomationsRef.current = false;
		loadingMoreRunsRef.current = false;
		setCapabilities(null);
		setAutomations([]);
		setRuns([]);
		setMonitoredRuns([]);
		setAutomationNextCursor(null);
		setRunNextCursor(null);
		setIsLoadingMoreAutomations(false);
		setIsLoadingMoreRuns(false);
		setError(null);
		setIsLoading(true);
		void refresh();
	}, [refresh]);

	useEffect(() => {
		if (!activeHostUrl) return;
		const hostUrl = activeHostUrl;
		const generation = hostGenerationRef.current;
		let stopped = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const client = getHostServiceClientByUrl(hostUrl);
		const poll = async () => {
			try {
				const after = cursorRef.current;
				const result = await client.automations.readEvents.query({
					after,
					limit: PAGE_SIZE,
				});
				if (
					stopped ||
					activeHostUrlRef.current !== hostUrl ||
					hostGenerationRef.current !== generation
				)
					return;
				const hasGap =
					result.events.length > 0 && result.events[0].seq > after + 1;
				if (hasGap) await refresh();
				else if (result.events.length > 0) {
					const runIds = [
						...new Set(
							result.events.flatMap((event) =>
								event.runId ? [event.runId] : [],
							),
						),
					];
					const automationIds = [
						...new Set(
							result.events.flatMap((event) =>
								event.automationId ? [event.automationId] : [],
							),
						),
					];
					const [changedRuns, changedAutomations] = await Promise.all([
						Promise.all(
							runIds.map((id) => client.automations.getRun.query({ id })),
						),
						Promise.all(
							automationIds.map((id) => client.automations.get.query({ id })),
						),
					]);
					if (
						stopped ||
						activeHostUrlRef.current !== hostUrl ||
						hostGenerationRef.current !== generation
					)
						return;
					const previousTrackedRuns = trackedRunsRef.current;
					const runWindowRevision = runWindowRevisionRef.current;
					const automationWindowRevision = automationWindowRevisionRef.current;
					const runPageCount = loadedRunPagesRef.current;
					const automationPageCount = loadedAutomationPagesRef.current;
					const reloadRunWindow = changedRuns.some((run) =>
						runCanEnterWindow(run, runsRef.current, runNextCursorRef.current),
					);
					const reloadAutomationWindow = changedAutomations.some((automation) =>
						automationCanEnterWindow(
							automation,
							automationsRef.current,
							automationNextCursorRef.current,
						),
					);
					const [runWindow, automationWindow] = await Promise.all([
						reloadRunWindow
							? readPageWindow(
									(cursor) =>
										client.automations.listRuns.query({
											limit: PAGE_SIZE,
											cursor,
										}),
									runPageCount,
								)
							: Promise.resolve(null),
						reloadAutomationWindow
							? readPageWindow(
									(cursor) =>
										client.automations.list.query({
											limit: PAGE_SIZE,
											cursor,
										}),
									automationPageCount,
								)
							: Promise.resolve(null),
					]);
					if (
						stopped ||
						activeHostUrlRef.current !== hostUrl ||
						hostGenerationRef.current !== generation ||
						runWindowRevisionRef.current !== runWindowRevision ||
						automationWindowRevisionRef.current !== automationWindowRevision
					)
						return;
					const nextRuns = runWindow
						? runWindow.items
						: updateExistingById(runsRef.current, changedRuns);
					const monitored = new Map(
						monitoredRunsRef.current.map((run) => [run.id, run]),
					);
					for (const run of changedRuns) {
						if (isMonitoredRun(run)) monitored.set(run.id, run);
						else monitored.delete(run.id);
					}
					const nextMonitoredRuns = sortRuns([...monitored.values()]);
					const nextTrackedRuns = sortRuns(
						mergeById(nextMonitoredRuns, nextRuns),
					);
					const nextAutomations = automationWindow
						? automationWindow.items
						: updateExistingById(automationsRef.current, changedAutomations);
					runsRef.current = nextRuns;
					monitoredRunsRef.current = nextMonitoredRuns;
					trackedRunsRef.current = nextTrackedRuns;
					automationsRef.current = nextAutomations;
					setRuns(nextRuns);
					setMonitoredRuns(nextMonitoredRuns);
					setAutomations(nextAutomations);
					if (runWindow) runWindowRevisionRef.current += 1;
					if (automationWindow) automationWindowRevisionRef.current += 1;
					if (runWindow) {
						runNextCursorRef.current = runWindow.nextCursor;
						setRunNextCursor(runWindow.nextCursor);
					}
					if (automationWindow) {
						automationNextCursorRef.current = automationWindow.nextCursor;
						setAutomationNextCursor(automationWindow.nextCursor);
					}
					notifyRunChangesRef.current(
						previousTrackedRuns,
						mergeById(changedRuns, nextTrackedRuns),
					);
					cursorRef.current = Math.min(
						result.cursor,
						runWindow?.cursor ?? result.cursor,
						automationWindow?.cursor ?? result.cursor,
					);
				}
			} catch {
				if (!stopped) await refresh();
			} finally {
				if (!stopped) timer = setTimeout(poll, EVENT_POLL_MS);
			}
		};
		timer = setTimeout(poll, EVENT_POLL_MS);
		return () => {
			stopped = true;
			clearTimeout(timer);
		};
	}, [activeHostUrl, refresh]);

	const ownershipFor = useCallback(
		(automation: Pick<Automation, "definition">): AutomationOwnership => {
			const target = automation.definition.target;
			if (target.kind === "newWorktree") {
				const available = projects.some(
					(project) => project.projectKey === target.projectId,
				);
				return {
					profileId: available
						? profiles.getProjectProfileId(target.projectId)
						: null,
					targetAvailable: available,
				};
			}
			const workspace = workspaces.find(
				(candidate) => candidate.id === target.workspaceId,
			);
			return {
				profileId: workspace ? profiles.getWorkspaceProfileId(workspace) : null,
				targetAvailable: Boolean(workspace),
			};
		},
		[profiles, projects, workspaces],
	);
	const attentionRuns = useMemo(
		() => monitoredRuns.filter(isAttentionRun),
		[monitoredRuns],
	);

	const withRefresh = useCallback(
		async <T,>(operation: () => Promise<T>): Promise<T> => {
			const result = await operation();
			await refresh();
			return result;
		},
		[refresh],
	);

	const value = useMemo<HostAutomationsContextValue>(() => {
		const client = activeHostUrl
			? getHostServiceClientByUrl(activeHostUrl)
			: null;
		const requireClient = () => {
			if (!client) throw new Error("The local Host service is unavailable");
			return client;
		};
		return {
			capabilities,
			automations,
			runs,
			attentionRuns,
			hasMoreAutomations: automationNextCursor !== null,
			hasMoreRuns: runNextCursor !== null,
			isLoadingMoreAutomations,
			isLoadingMoreRuns,
			isLoading,
			error,
			refresh,
			loadMoreAutomations,
			loadMoreRuns,
			getAutomation: (id) => requireClient().automations.get.query({ id }),
			ownershipFor,
			getRun: (id) => requireClient().automations.getRun.query({ id }),
			preview: (definition, options = {}) =>
				requireClient().automations.preview.query({
					definition,
					automationId: options.automationId,
					expectedVersion: options.expectedVersion,
					intent: options.intent ?? "save",
				}),
			create: (confirmationToken, runImmediately) =>
				withRefresh(() =>
					requireClient().automations.create.mutate({
						requestId: requestId(),
						confirmationToken,
						runImmediately,
					}),
				),
			update: (automation, confirmationToken) =>
				withRefresh(async () => {
					await requireClient().automations.update.mutate({
						requestId: requestId(),
						id: automation.id,
						expectedVersion: automation.version,
						confirmationToken,
					});
				}),
			setScheduleState: (automation, state, confirmationToken, resumeAt) =>
				withRefresh(async () => {
					await requireClient().automations.setScheduleState.mutate({
						requestId: requestId(),
						id: automation.id,
						expectedVersion: automation.version,
						state,
						confirmationToken,
						resumeAt,
					});
				}),
			archive: (automation) =>
				withRefresh(async () => {
					await requireClient().automations.archive.mutate({
						requestId: requestId(),
						id: automation.id,
						expectedVersion: automation.version,
					});
				}),
			runNow: (automation) =>
				withRefresh(() =>
					requireClient().automations.runNow.mutate({
						requestId: requestId(),
						id: automation.id,
					}),
				),
			retryRun: (run) =>
				withRefresh(() =>
					requireClient().automations.retryRun.mutate({
						requestId: requestId(),
						runId: run.id,
					}),
				),
			requestCancel: (run) =>
				withRefresh(() =>
					requireClient().executions.requestCancel.mutate({
						requestId: requestId(),
						runId: run.id,
					}),
				),
			answerInput: (_run, inputId, expectedVersion, answer) =>
				withRefresh(() =>
					requireClient().executions.answerInput.mutate({
						requestId: requestId(),
						inputId,
						expectedVersion,
						answer,
					}),
				),
		};
	}, [
		activeHostUrl,
		attentionRuns,
		automationNextCursor,
		automations,
		capabilities,
		error,
		isLoading,
		isLoadingMoreAutomations,
		isLoadingMoreRuns,
		loadMoreAutomations,
		loadMoreRuns,
		ownershipFor,
		refresh,
		runNextCursor,
		runs,
		withRefresh,
	]);

	return (
		<HostAutomationsContext.Provider value={value}>
			{children}
		</HostAutomationsContext.Provider>
	);
}

export function useHostAutomations(): HostAutomationsContextValue {
	const value = useContext(HostAutomationsContext);
	if (!value) {
		throw new Error(
			"useHostAutomations must be used within HostAutomationsProvider",
		);
	}
	return value;
}
