import { useLocation, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { HostProjectItem } from "renderer/hooks/host-projects/use-host-projects";
import type { HostWorkspaceItem } from "renderer/hooks/host-workspaces/use-host-workspaces";
import {
	getHistoryNavigationIntent,
	persistentHistory,
} from "renderer/lib/persistent-hash-history";
import type {
	ProfileDefinition,
	ProfileSubmissionContext,
	ProfileVisit,
} from "shared/profiles";
import {
	type FailedProfileWorkspace,
	resolveFailedWorkspaceProfileId,
} from "../../utils/profile-projection/failed-workspace-profile";
import {
	ProfileNavigationGeneration,
	type ProfileWorkspaceIdentity,
	parseProfileRoute,
	resolveProfileRecoveryTarget,
} from "../../utils/profile-projection/profile-projection";

export interface ProfileFocusRequest {
	generation: number;
	workspaceId: string;
	source: { type: string; id: string };
}

interface Options {
	isReady: boolean;
	activeProfileId: string;
	workspaces: HostWorkspaceItem[];
	workspacesReady: boolean;
	projects: HostProjectItem[];
	projectsReady: boolean;
	profiles: ProfileDefinition[];
	defaultProfileId: string;
	failedWorkspaces: readonly FailedProfileWorkspace[];
	getFailedWorkspace: (
		workspaceId: string,
	) => FailedProfileWorkspace | undefined;
	activateProfile: (profileId: string) => void;
	getWorkspaceProfileId: (workspace: ProfileWorkspaceIdentity) => string;
	getProjectProfileId: (projectId: string) => string;
	getVisits: (profileId: string) => Promise<ProfileVisit[]>;
	onNavigationError: () => void;
}

export function useProfileNavigation(options: Options) {
	const router = useRouter();
	const location = useLocation();
	const latest = useRef(options);
	latest.current = options;
	const clock = useRef(new ProfileNavigationGeneration());
	const [generation, setGeneration] = useState(0);
	const [settledRevision, setSettledRevision] = useState(0);
	const [focusRequest, setFocusRequest] = useState<ProfileFocusRequest | null>(
		null,
	);
	const [explicitRequest, setExplicitRequest] = useState<{
		path: string;
		generation: number;
		hostId?: string;
		source?: { type: string; id: string };
		resolve: () => void;
	} | null>(null);
	const explicit = useRef(explicitRequest);
	explicit.current = explicitRequest;
	const switching = useRef<number | null>(null);
	const initialRouteHandled = useRef(false);
	const knownWorkspaceRoute = useRef<string | null>(null);
	const restoring = useRef<{
		operation: number;
		profileId: string;
		path: string;
		workspaceId: string | null;
		excluded: Set<string>;
	} | null>(null);
	// Bounded by pending/live workspaces, failed attempts, and the current route.
	// is submission UI metadata only; it never creates a member or a visit.
	const submittedWorkspaceOwners = useRef(new Map<string, string>());
	const pendingWorkspaceSubmissions = useRef(new Set<string>());
	const rememberWorkspaceSubmission = useCallback(
		(workspaceId: string, context: ProfileSubmissionContext) => {
			submittedWorkspaceOwners.current.set(workspaceId, context.profileId);
			pendingWorkspaceSubmissions.current.add(workspaceId);
			return () => {
				pendingWorkspaceSubmissions.current.delete(workspaceId);
			};
		},
		[],
	);
	// biome-ignore lint/correctness/useExhaustiveDependencies: failed entries trigger pruning; the getter reads the current indexed snapshot
	useEffect(() => {
		const liveIds = new Set(
			options.workspaces.map((workspace) => workspace.id),
		);
		const route = parseProfileRoute(location.href);
		for (const workspaceId of submittedWorkspaceOwners.current.keys()) {
			if (
				pendingWorkspaceSubmissions.current.has(workspaceId) ||
				liveIds.has(workspaceId) ||
				options.getFailedWorkspace(workspaceId) ||
				(route.kind === "workspace" && route.workspaceId === workspaceId)
			)
				continue;
			submittedWorkspaceOwners.current.delete(workspaceId);
		}
	}, [
		options.workspaces,
		options.failedWorkspaces,
		options.getFailedWorkspace,
		location.href,
	]);
	const nextGeneration = useCallback(() => {
		const next = clock.current.next();
		setGeneration(next);
		setFocusRequest(null);
		explicit.current?.resolve();
		explicit.current = null;
		setExplicitRequest(null);
		switching.current = null;
		restoring.current = null;
		return next;
	}, []);

	// The history tags only this synchronous call. Its commit guard also runs
	// after asynchronous route blockers, so an older intent cannot land late.
	const ownedNavigate = useCallback(
		(callback: () => Promise<void>) =>
			persistentHistory.runWithNavigationIntent(
				clock.current.current,
				callback,
			),
		[],
	);

	useEffect(() => {
		let previous = persistentHistory.location;
		const removeValidator = persistentHistory.setNavigationIntentValidator(
			(intent) => clock.current.isCurrent(intent),
		);
		const unsubscribe = persistentHistory.subscribe(({ location, action }) => {
			if (
				location.state.__TSR_key === previous.state.__TSR_key &&
				location.href === previous.href
			)
				return;
			previous = location;
			const owned =
				(action.type === "PUSH" || action.type === "REPLACE") &&
				getHistoryNavigationIntent(location) !== undefined;
			if (owned) {
				const route = parseProfileRoute(location.href);
				if (route.kind === "workspace")
					submittedWorkspaceOwners.current.set(
						route.workspaceId,
						latest.current.activeProfileId,
					);
			}
			if (!owned) nextGeneration();
		});
		return () => {
			unsubscribe();
			removeValidator();
		};
	}, [nextGeneration]);

	const getWorkspaceRouteOwner = useCallback(
		(workspaceId: string, hostId?: string): string | null => {
			const current = latest.current;
			const failure = current.getFailedWorkspace(workspaceId);
			if (failure && (!hostId || failure.hostId === hostId)) {
				return resolveFailedWorkspaceProfileId({
					failure,
					capturedProfileId: submittedWorkspaceOwners.current.get(workspaceId),
					profiles: current.profiles,
					defaultProfileId: current.defaultProfileId,
					getProjectProfileId: current.getProjectProfileId,
				});
			}
			const workspace = current.workspaces.find(
				(row) => row.id === workspaceId && (!hostId || row.hostId === hostId),
			);
			return workspace ? current.getWorkspaceProfileId(workspace) : null;
		},
		[],
	);

	const isRouteVisible = useCallback(
		(path: string) => {
			const current = latest.current;
			const route = parseProfileRoute(path);
			if (route.kind === "global") return true;
			if (!current.isReady) return false;
			if (route.kind === "workspace")
				return (
					getWorkspaceRouteOwner(route.workspaceId) === current.activeProfileId
				);
			const projectId = route.projectId;
			return (
				!!projectId &&
				current.projects.some((project) => project.projectKey === projectId) &&
				current.getProjectProfileId(projectId) === current.activeProfileId
			);
		},
		[getWorkspaceRouteOwner],
	);

	useEffect(
		() => persistentHistory.setNavigationFilter(isRouteVisible),
		[isRouteVisible],
	);

	const recover = useCallback(
		async (profileId: string, path: string, operation: number) => {
			const restore =
				restoring.current?.operation === operation
					? restoring.current
					: {
							operation,
							profileId,
							path,
							workspaceId: null,
							excluded: new Set<string>(),
						};
			restoring.current = restore;
			const target = await resolveProfileRecoveryTarget({
				path,
				profileId,
				getVisits: () => latest.current.getVisits(profileId),
				getSnapshot: () => latest.current,
				isCurrent: () => clock.current.isCurrent(operation),
				onError: () => latest.current.onNavigationError(),
				excludedWorkspaceIds: restore.excluded,
			});
			if (!clock.current.isCurrent(operation)) return;
			if (!target) {
				switching.current = null;
				restoring.current = null;
				return;
			}
			const route = parseProfileRoute(target);
			restore.workspaceId =
				route.kind === "workspace" ? route.workspaceId : null;
			try {
				await ownedNavigate(() =>
					router.navigate({ to: target, replace: true }),
				);
			} catch {
				if (clock.current.isCurrent(operation))
					latest.current.onNavigationError();
			} finally {
				if (clock.current.isCurrent(operation)) {
					switching.current = null;
					setSettledRevision((value) => value + 1);
				}
			}
		},
		[ownedNavigate, router],
	);

	const reportWorkspaceUnavailable = useCallback(
		(workspaceId: string) => {
			const restore = restoring.current;
			if (
				!restore ||
				restore.workspaceId !== workspaceId ||
				!clock.current.isCurrent(restore.operation)
			)
				return;
			const workspace = latest.current.workspaces.find(
				(row) => row.id === workspaceId,
			);
			if (workspace)
				restore.excluded.add(JSON.stringify([workspace.hostId, workspace.id]));
			restore.workspaceId = null;
			switching.current = restore.operation;
			void recover(restore.profileId, restore.path, restore.operation);
		},
		[recover],
	);
	const confirmWorkspaceOpened = useCallback(() => {
		restoring.current = null;
	}, []);

	const selectProfile = useCallback(
		(profileId: string) => {
			if (latest.current.activeProfileId === profileId) return;
			const operation = nextGeneration();
			switching.current = operation;
			latest.current.activateProfile(profileId);
			// Set the synchronous view of selection as well as React state, so a
			// second click/submission in this event turn observes the new owner.
			latest.current = { ...latest.current, activeProfileId: profileId };
			void recover(profileId, router.state.location.href, operation);
		},
		[nextGeneration, recover, router],
	);

	const requestTarget = useCallback(
		(
			path: string,
			options?: { hostId?: string; source?: { type: string; id: string } },
		) => {
			const operation = nextGeneration();
			return new Promise<void>((resolve) => {
				const request = { path, generation: operation, ...options, resolve };
				explicit.current = request;
				setExplicitRequest(request);
			});
		},
		[nextGeneration],
	);
	const openTarget = useCallback(
		(path: string) => {
			void requestTarget(path);
		},
		[requestTarget],
	);
	const openWorkspace = useCallback(
		(
			workspaceId: string,
			options?: { hostId?: string; source?: { type: string; id: string } },
		) =>
			requestTarget(
				`/v2-workspace/${encodeURIComponent(workspaceId)}`,
				options,
			),
		[requestTarget],
	);
	const openProject = useCallback(
		(projectId: string) =>
			openTarget(`/project/${encodeURIComponent(projectId)}`),
		[openTarget],
	);

	useEffect(() => {
		if (!options.isReady || initialRouteHandled.current) return;
		initialRouteHandled.current = true;
	}, [options.isReady]);

	useEffect(() => {
		const request = explicitRequest;
		if (
			!request ||
			!options.isReady ||
			!clock.current.isCurrent(request.generation)
		)
			return;
		const route = parseProfileRoute(request.path);
		let owner: string | null = null;
		if (route.kind === "workspace") {
			owner = getWorkspaceRouteOwner(route.workspaceId, request.hostId);
		} else if (route.kind === "project" || route.kind === "pull-request") {
			if (
				route.projectId &&
				options.projects.some(
					(project) => project.projectKey === route.projectId,
				)
			)
				owner = options.getProjectProfileId(route.projectId);
		}
		if (owner && owner !== options.activeProfileId) {
			options.activateProfile(owner);
			latest.current = { ...latest.current, activeProfileId: owner };
		}
		// An unknown workspace still reaches the existing bounded CLI miss
		// verdict. Retain this explicit identity until its delayed row arrives;
		// an ordinary route or newer intent cancels it synchronously.
		if (owner || route.kind === "global") {
			explicit.current = null;
			setExplicitRequest(null);
			if (request.source && route.kind === "workspace")
				setFocusRequest({
					generation: request.generation,
					workspaceId: route.workspaceId,
					source: request.source,
				});
		}
		const navigate =
			router.state.location.href === request.path
				? Promise.resolve()
				: ownedNavigate(() => router.navigate({ to: request.path }));
		void navigate.then(request.resolve, () => {
			if (clock.current.isCurrent(request.generation))
				options.onNavigationError();
			request.resolve();
		});
	}, [explicitRequest, options, ownedNavigate, router, getWorkspaceRouteOwner]);

	useEffect(() => {
		if (
			!options.isReady ||
			!initialRouteHandled.current ||
			explicit.current ||
			switching.current !== null
		)
			return;
		const route = parseProfileRoute(location.href);
		if (route.kind === "global") return;
		if (route.kind === "workspace") {
			const workspace = options.workspaces.find(
				(row) => row.id === route.workspaceId,
			);
			if (workspace || options.getFailedWorkspace(route.workspaceId))
				knownWorkspaceRoute.current = location.pathname;
			else if (
				!options.workspacesReady ||
				knownWorkspaceRoute.current !== location.pathname
			)
				return;
		} else if (!options.projectsReady) return;
		if (isRouteVisible(location.href)) return;
		const operation = nextGeneration();
		switching.current = operation;
		void recover(options.activeProfileId, location.href, operation);
	}, [
		options,
		location.href,
		location.pathname,
		isRouteVisible,
		nextGeneration,
		recover,
	]);

	const captureSubmission = useCallback(
		(): ProfileSubmissionContext => ({
			profileId: latest.current.activeProfileId,
			requestId: crypto.randomUUID(),
			generation: clock.current.current,
		}),
		[],
	);
	const isSubmissionCurrent = useCallback(
		(context: ProfileSubmissionContext) =>
			context.profileId === latest.current.activeProfileId &&
			clock.current.isCurrent(context.generation),
		[],
	);
	const runSubmissionNavigation = useCallback(
		async (
			context: ProfileSubmissionContext,
			callback: () => Promise<void>,
		) => {
			if (!isSubmissionCurrent(context)) return;
			await ownedNavigate(callback);
		},
		[isSubmissionCurrent, ownedNavigate],
	);
	// biome-ignore lint/correctness/useExhaustiveDependencies: settled and explicit navigation invalidate readiness consumers while callbacks read current refs
	const isWorkspaceNavigationCurrent = useCallback(
		(workspace: ProfileWorkspaceIdentity) => {
			const route = parseProfileRoute(router.state.location.href);
			return (
				latest.current.isReady &&
				switching.current === null &&
				explicit.current === null &&
				route.kind === "workspace" &&
				route.workspaceId === workspace.id &&
				latest.current.getWorkspaceProfileId(workspace) ===
					latest.current.activeProfileId
			);
		},
		[router, settledRevision, explicitRequest],
	);
	const consumeFocusRequest = useCallback(
		(operation: number) =>
			setFocusRequest((current) =>
				current?.generation === operation ? null : current,
			),
		[],
	);
	return {
		generation,
		selectProfile,
		openWorkspace,
		openProject,
		openTarget,
		captureSubmission,
		isSubmissionCurrent,
		runSubmissionNavigation,
		isRouteVisible,
		isWorkspaceNavigationCurrent,
		focusRequest,
		consumeFocusRequest,
		reportWorkspaceUnavailable,
		confirmWorkspaceOpened,
		rememberWorkspaceSubmission,
	};
}
