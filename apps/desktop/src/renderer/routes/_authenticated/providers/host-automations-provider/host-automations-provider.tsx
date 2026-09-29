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

const PAGE_SIZE = 100;
const MAX_SNAPSHOT_PAGES = 20;
const EVENT_POLL_MS = 2_000;

interface AutomationOwnership {
	profileId: string | null;
	targetAvailable: boolean;
}

interface HostAutomationsContextValue {
	capabilities: AutomationCapabilities | null;
	automations: Automation[];
	runs: AutomationRun[];
	isLoading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
	ownershipFor: (
		automation: Pick<Automation, "definition">,
	) => AutomationOwnership;
	getRun: (id: string) => Promise<AutomationRun>;
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
	load: (cursor?: string) => Promise<{
		items: T[];
		nextCursor: string | null;
		cursor: number;
	}>,
): Promise<{ items: T[]; cursor: number }> {
	const items: T[] = [];
	let nextCursor: string | undefined;
	let snapshotCursor = 0;
	for (let page = 0; page < MAX_SNAPSHOT_PAGES; page += 1) {
		const result = await load(nextCursor);
		items.push(...result.items);
		snapshotCursor =
			page === 0 ? result.cursor : Math.min(snapshotCursor, result.cursor);
		if (!result.nextCursor) return { items, cursor: snapshotCursor };
		nextCursor = result.nextCursor;
	}
	throw new Error("AUTOMATION_SNAPSHOT_LIMIT");
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
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const cursorRef = useRef(0);
	const loadedRef = useRef(false);
	const runsRef = useRef<AutomationRun[]>([]);

	const notifyRunChanges = useCallback(
		(
			previous: readonly AutomationRun[],
			next: readonly AutomationRun[],
			nextAutomations: readonly Automation[],
		) => {
			if (!loadedRef.current) return;
			const previousById = new Map(previous.map((run) => [run.id, run.status]));
			const automationsById = new Map(
				nextAutomations.map((automation) => [automation.id, automation]),
			);
			for (const run of next) {
				if (
					previousById.get(run.id) === run.status ||
					!runNeedsNativeNotification(run)
				)
					continue;
				const automation = automationsById.get(run.automationId);
				const automationName =
					automation?.definition.name ?? run.definition.name;
				const target = automation?.definition.target ?? run.definition.target;
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
					body: automationName,
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

	const refresh = useCallback(async () => {
		if (!activeHostUrl) {
			setCapabilities(null);
			setAutomations([]);
			setRuns([]);
			setError(
				t({
					id: "automations.error.hostUnavailable",
					message: "The local Host service is unavailable.",
				}),
			);
			setIsLoading(false);
			return;
		}
		const client = getHostServiceClientByUrl(activeHostUrl);
		try {
			const [nextCapabilities, automationPage, runPage] = await Promise.all([
				client.automations.capabilities.query(),
				readAllPages((cursor) =>
					client.automations.list.query({ limit: PAGE_SIZE, cursor }),
				),
				readAllPages((cursor) =>
					client.automations.listRuns.query({ limit: PAGE_SIZE, cursor }),
				),
			]);
			const previousRuns = runsRef.current;
			setCapabilities(nextCapabilities);
			setAutomations(automationPage.items);
			setRuns(runPage.items);
			runsRef.current = runPage.items;
			cursorRef.current = Math.min(automationPage.cursor, runPage.cursor);
			setError(null);
			notifyRunChanges(previousRuns, runPage.items, automationPage.items);
			loadedRef.current = true;
		} catch (cause) {
			setError(
				cause instanceof Error && cause.message === "AUTOMATION_SNAPSHOT_LIMIT"
					? t({
							id: "automations.error.snapshotLimit",
							message:
								"Automation history is too large to load in one snapshot. Refine the view and try again.",
						})
					: cause instanceof Error
						? cause.message
						: String(cause),
			);
		} finally {
			setIsLoading(false);
		}
	}, [activeHostUrl, notifyRunChanges, t]);

	useEffect(() => {
		loadedRef.current = false;
		cursorRef.current = 0;
		setIsLoading(true);
		void refresh();
	}, [refresh]);

	useEffect(() => {
		if (!activeHostUrl) return;
		let stopped = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const client = getHostServiceClientByUrl(activeHostUrl);
		const poll = async () => {
			try {
				const after = cursorRef.current;
				const result = await client.automations.readEvents.query({
					after,
					limit: PAGE_SIZE,
				});
				if (stopped) return;
				const hasGap =
					result.events.length > 0 && result.events[0].seq > after + 1;
				cursorRef.current = result.cursor;
				if (hasGap || result.events.length > 0) await refresh();
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
			isLoading,
			error,
			refresh,
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
		automations,
		capabilities,
		error,
		isLoading,
		ownershipFor,
		refresh,
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
