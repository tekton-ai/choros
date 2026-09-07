import { i18n } from "@choros/i18n";
import { toast } from "@choros/ui/sonner";
import { useLiveQuery } from "@tanstack/react-db";
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
import {
	DEFAULT_PROFILE_ID,
	type ProfileAssignmentResult,
	type ProfileDefinition,
	type ProfileMemberRef,
	type ProfileMembership,
	type ProfileRegistry,
	type ProfileSubmissionContext,
	type ProfileVisit,
	profileMemberKey,
} from "shared/profiles";
import { ProfileManagerDialog } from "../../components/profile-manager-dialog";
import { ProfileNavigationController } from "../../components/profile-navigation-controller";
import { useCollections } from "../collections-provider";
import { useHostWorkspaces } from "../host-workspaces-provider";
import {
	type ProfileFocusRequest,
	useProfileNavigation,
} from "./hooks/use-profile-navigation/use-profile-navigation";
import {
	createProfileProjection,
	type ProfileWorkspaceIdentity,
} from "./utils/profile-projection/profile-projection";

const fallbackProfile: ProfileDefinition = {
	id: DEFAULT_PROFILE_ID,
	name: "Default",
	isDefault: true,
	sortOrder: 0,
	createdAt: 0,
	updatedAt: 0,
};
const fallbackProfiles = [fallbackProfile];
const noMemberships: ProfileMembership[] = [];
const noVisits: ProfileVisit[] = [];

export interface ProfilesContextValue {
	available: boolean;
	isReady: boolean;
	profiles: ProfileDefinition[];
	memberships: ProfileMembership[];
	activeProfileId: string;
	defaultProfileId: string;
	generation: number;
	visits: ProfileVisit[];
	getProjectProfileId: (projectKey: string) => string;
	getWorkspaceProfileId: (workspace: ProfileWorkspaceIdentity) => string;
	isProjectVisible: (projectKey: string) => boolean;
	isWorkspaceVisible: (workspace: ProfileWorkspaceIdentity) => boolean;
	selectProfile: (profileId: string) => void;
	openWorkspace: (
		workspaceId: string,
		options?: { hostId?: string; source?: { type: string; id: string } },
	) => Promise<void>;
	openProject: (projectId: string) => void;
	openTarget: (path: string) => void;
	captureSubmission: () => ProfileSubmissionContext;
	isSubmissionCurrent: (context: ProfileSubmissionContext) => boolean;
	runSubmissionNavigation: (
		context: ProfileSubmissionContext,
		callback: () => Promise<void>,
	) => Promise<void>;
	assignCreatedMember: (
		member: ProfileMemberRef,
		context: ProfileSubmissionContext,
	) => Promise<ProfileAssignmentResult>;
	registerPendingMember: (
		member: ProfileMemberRef,
		context: ProfileSubmissionContext,
	) => () => void;
	managerOpen: boolean;
	openManager: () => void;
	setManagerOpen: (open: boolean) => void;
	recoveryMembers: ProfileMemberRef[];
	clearRecoveryMembers: () => void;
	createProfile: (name: string) => Promise<ProfileDefinition | null>;
	renameProfile: (profileId: string, name: string) => Promise<boolean>;
	reorderProfiles: (profileIds: string[]) => Promise<boolean>;
	moveMembers: (
		members: ProfileMemberRef[],
		profileId: string,
	) => Promise<boolean>;
	deleteProfile: (
		profileId: string,
		moveToDefault: boolean,
	) => Promise<boolean>;
	recordOpenedWorkspace: (
		workspace: ProfileWorkspaceIdentity,
		openKey: string,
	) => void;
	isRouteVisible: (path: string) => boolean;
	isWorkspaceNavigationCurrent: (
		workspace: ProfileWorkspaceIdentity,
	) => boolean;
	focusRequest: ProfileFocusRequest | null;
	consumeFocusRequest: (generation: number) => void;
	reportWorkspaceUnavailable: (workspaceId: string) => void;
}

function reportProfileError(): void {
	toast.error(
		i18n._({
			id: "profiles.errors.operationFailed",
			message:
				"Could not save Work Profiles. Your work has not been changed. Try again.",
		}),
	);
}

// Non-work surfaces may call a shared creation hook before the authenticated
// providers exist. Such external creation has implicit Default ownership, not
// a fabricated persisted registry or a successful custom-profile write.
const fallbackContext: ProfilesContextValue = {
	available: false,
	isReady: false,
	profiles: fallbackProfiles,
	memberships: noMemberships,
	activeProfileId: DEFAULT_PROFILE_ID,
	defaultProfileId: DEFAULT_PROFILE_ID,
	generation: 0,
	visits: noVisits,
	getProjectProfileId: () => DEFAULT_PROFILE_ID,
	getWorkspaceProfileId: () => DEFAULT_PROFILE_ID,
	isProjectVisible: () => true,
	isWorkspaceVisible: () => true,
	selectProfile: () => {},
	openWorkspace: async (id) => {
		const { requestProfileTarget } = await import(
			"../../components/profile-navigation-controller/profile-navigation-bridge"
		);
		requestProfileTarget(`/v2-workspace/${encodeURIComponent(id)}`);
	},
	openProject: (id) => {
		void import(
			"../../components/profile-navigation-controller/profile-navigation-bridge"
		).then(({ requestProfileTarget }) =>
			requestProfileTarget(`/project/${encodeURIComponent(id)}`),
		);
	},
	openTarget: (path) => {
		void import(
			"../../components/profile-navigation-controller/profile-navigation-bridge"
		).then(({ requestProfileTarget }) => requestProfileTarget(path));
	},
	captureSubmission: () => ({
		profileId: DEFAULT_PROFILE_ID,
		requestId: crypto.randomUUID(),
		generation: 0,
	}),
	isSubmissionCurrent: (context) =>
		context.profileId === DEFAULT_PROFILE_ID && context.generation === 0,
	runSubmissionNavigation: async (context, callback) => {
		if (context.profileId === DEFAULT_PROFILE_ID) await callback();
	},
	assignCreatedMember: async (_member, context) => {
		if (context.profileId !== DEFAULT_PROFILE_ID) reportProfileError();
		return {
			profileId: DEFAULT_PROFILE_ID,
			assigned: context.profileId === DEFAULT_PROFILE_ID,
		};
	},
	registerPendingMember: () => () => {},
	managerOpen: false,
	openManager: reportProfileError,
	setManagerOpen: reportProfileError,
	recoveryMembers: [],
	clearRecoveryMembers: () => {},
	createProfile: async () => {
		reportProfileError();
		return null;
	},
	renameProfile: async () => {
		reportProfileError();
		return false;
	},
	reorderProfiles: async () => {
		reportProfileError();
		return false;
	},
	moveMembers: async () => {
		reportProfileError();
		return false;
	},
	deleteProfile: async () => {
		reportProfileError();
		return false;
	},
	recordOpenedWorkspace: () => {},
	isRouteVisible: () => false,
	isWorkspaceNavigationCurrent: () => false,
	focusRequest: null,
	consumeFocusRequest: () => {},
	reportWorkspaceUnavailable: () => {},
};
const ProfilesContext = createContext<ProfilesContextValue>(fallbackContext);

export function ProfileProvider({ children }: { children: ReactNode }) {
	const utils = electronTrpc.useUtils();
	const collections = useCollections();
	const { data: failedWorkspaces = [] } = useLiveQuery(
		(query) => query.from({ failed: collections.failedWorkspaceCreates }),
		[collections],
	);
	const getFailedWorkspace = useCallback(
		(workspaceId: string) =>
			collections.failedWorkspaceCreates.get(workspaceId),
		[collections],
	);
	const { workspaces, isReady: workspacesReady } = useHostWorkspaces();
	const { projects, isReady: projectsReady } = useHostProjects();
	const query = electronTrpc.profiles.get.useQuery(undefined, {
		refetchOnWindowFocus: true,
		refetchInterval: 5000,
		retry: false,
	});
	const [registry, setRegistry] = useState<ProfileRegistry | null>(null);
	const registryRef = useRef(registry);
	const [available, setAvailable] = useState(false);
	const availableRef = useRef(available);
	const [isReady, setIsReady] = useState(false);
	const readyRef = useRef(false);
	const [activeProfileId, setActiveProfileId] = useState(DEFAULT_PROFILE_ID);
	const activeRef = useRef(activeProfileId);
	const initialized = useRef(false);
	const [pending, setPending] = useState<
		Map<string, { profileId: string; token: symbol }>
	>(() => new Map());
	const pendingRef = useRef(pending);
	const [managerOpen, setManagerOpen] = useState(false);
	const [recoveryMembers, setRecoveryMembers] = useState<ProfileMemberRef[]>(
		[],
	);
	const openManager = useCallback(() => setManagerOpen(true), []);
	const clearRecoveryMembers = useCallback(() => setRecoveryMembers([]), []);
	const selectionQueue = useRef(Promise.resolve());
	const selectionSequence = useRef(0);
	const selectRef = useRef<(id: string) => void>(() => {});

	const profiles = available && registry ? registry.profiles : fallbackProfiles;
	const memberships =
		available && registry ? registry.memberships : noMemberships;
	const projection = useMemo(
		() =>
			createProfileProjection(
				profiles,
				memberships,
				new Map([...pending].map(([key, value]) => [key, value.profileId])),
			),
		[profiles, memberships, pending],
	);
	const projectionRef = useRef(projection);
	projectionRef.current = projection;
	// biome-ignore lint/correctness/useExhaustiveDependencies: projection changes invalidate consumers while ref reads keep async completions current
	const getProjectProfileId = useCallback(
		(key: string) => projectionRef.current.getProjectProfileId(key),
		[projection],
	);
	// biome-ignore lint/correctness/useExhaustiveDependencies: projection changes invalidate consumers while ref reads keep async completions current
	const getWorkspaceProfileId = useCallback(
		(workspace: ProfileWorkspaceIdentity) =>
			projectionRef.current.getWorkspaceProfileId(workspace),
		[projection],
	);

	const applyRegistry = useCallback((next: ProfileRegistry) => {
		if (registryRef.current && next.revision < registryRef.current.revision)
			return;
		registryRef.current = next;
		availableRef.current = true;
		setRegistry(next);
		setAvailable(true);
		readyRef.current = true;
		setIsReady(true);
		projectionRef.current = createProfileProjection(
			next.profiles,
			next.memberships,
			new Map(
				[...pendingRef.current].map(([key, value]) => [key, value.profileId]),
			),
		);
		if (!initialized.current) {
			initialized.current = true;
			activeRef.current = next.profiles.some(
				(profile) => profile.id === next.selectedProfileId,
			)
				? next.selectedProfileId
				: projectionRef.current.defaultProfileId;
			setActiveProfileId(activeRef.current);
		} else if (
			!next.profiles.some((profile) => profile.id === activeRef.current)
		) {
			selectRef.current(projectionRef.current.defaultProfileId);
		}
	}, []);

	const markRegistryUnavailable = useCallback(() => {
		availableRef.current = false;
		setAvailable(false);
		readyRef.current = true;
		setIsReady(true);
		projectionRef.current = createProfileProjection(
			fallbackProfiles,
			noMemberships,
		);
		if (activeRef.current !== DEFAULT_PROFILE_ID)
			selectRef.current(DEFAULT_PROFILE_ID);
	}, []);

	const refreshRegistry = useCallback(async () => {
		const result = await utils.client.profiles.get.query();
		if (!result.available) throw new Error("PROFILE_UNAVAILABLE");
		applyRegistry(result.registry);
		utils.profiles.get.setData(undefined, result);
		return result.registry;
	}, [utils, applyRegistry]);

	useEffect(() => {
		if (query.data?.available && !query.isError) {
			applyRegistry(query.data.registry);
			return;
		}
		if (!query.data && !query.isError) return;
		markRegistryUnavailable();
	}, [query.data, query.isError, applyRegistry, markRegistryUnavailable]);

	const unavailableShown = useRef(false);
	useEffect(() => {
		if (isReady && !available && !unavailableShown.current) {
			unavailableShown.current = true;
			toast.error(
				i18n._({
					id: "profiles.errors.unavailable",
					message:
						"Work Profiles are unavailable. Existing work is shown in Default. Retry to restore your saved Profiles.",
				}),
				{
					duration: Infinity,
					id: "profiles-unavailable",
					action: {
						label: i18n._({ id: "profiles.actions.retry", message: "Retry" }),
						onClick: () => {
							void query.refetch();
						},
					},
				},
			);
		} else if (available) {
			unavailableShown.current = false;
			toast.dismiss("profiles-unavailable");
		}
	}, [available, isReady, query.refetch]);

	electronTrpc.profiles.onChanged.useSubscription(undefined, {
		onData: (event) => {
			if (event.kind === "visits") {
				void utils.profiles.visits.invalidate();
				return;
			}
			if (!registryRef.current || event.revision > registryRef.current.revision)
				void utils.profiles.get.invalidate();
		},
	});

	const activateProfile = useCallback(
		(profileId: string) => {
			activeRef.current = profileId;
			setActiveProfileId(profileId);
			if (!availableRef.current) return;
			const sequence = ++selectionSequence.current;
			selectionQueue.current = selectionQueue.current.then(async () => {
				try {
					await utils.client.profiles.select.mutate({ profileId });
				} catch {
					if (sequence === selectionSequence.current) reportProfileError();
				}
			});
		},
		[utils],
	);
	const getVisits = useCallback(
		async (profileId: string) => {
			if (!availableRef.current) return noVisits;
			return utils.profiles.visits.fetch({ profileId });
		},
		[utils],
	);
	const navigation = useProfileNavigation({
		isReady,
		activeProfileId,
		profiles,
		defaultProfileId: projection.defaultProfileId,
		projects,
		projectsReady,
		workspaces,
		workspacesReady,
		failedWorkspaces,
		getFailedWorkspace,
		activateProfile,
		getProjectProfileId,
		getWorkspaceProfileId,
		getVisits,
		onNavigationError: reportProfileError,
	});
	selectRef.current = navigation.selectProfile;
	const selectProfile = useCallback((profileId: string) => {
		if (
			profileId !== DEFAULT_PROFILE_ID &&
			!registryRef.current?.profiles.some((profile) => profile.id === profileId)
		)
			return;
		if (!availableRef.current && profileId !== DEFAULT_PROFILE_ID) return;
		selectRef.current(profileId);
	}, []);

	const visitsQuery = electronTrpc.profiles.visits.useQuery(
		{ profileId: activeProfileId },
		{ enabled: available && isReady, retry: false },
	);
	// biome-ignore lint/correctness/useExhaustiveDependencies: selection and readiness invalidate consumers while ref reads prevent stale asynchronous results
	const isProjectVisible = useCallback(
		(key: string) =>
			readyRef.current && getProjectProfileId(key) === activeRef.current,
		[getProjectProfileId, activeProfileId, isReady],
	);
	// biome-ignore lint/correctness/useExhaustiveDependencies: selection and readiness invalidate consumers while ref reads prevent stale asynchronous results
	const isWorkspaceVisible = useCallback(
		(workspace: ProfileWorkspaceIdentity) =>
			readyRef.current &&
			getWorkspaceProfileId(workspace) === activeRef.current,
		[getWorkspaceProfileId, activeProfileId, isReady],
	);

	const mutate = useCallback(
		async (operation: () => Promise<unknown>) => {
			if (!availableRef.current) {
				reportProfileError();
				return false;
			}
			try {
				await operation();
			} catch {
				reportProfileError();
				return false;
			}
			// A read failure cannot undo an acknowledged atomic write.
			try {
				await refreshRegistry();
			} catch {
				markRegistryUnavailable();
			}
			return true;
		},
		[refreshRegistry, markRegistryUnavailable],
	);
	const createProfile = useCallback(
		async (name: string) => {
			if (!availableRef.current) {
				reportProfileError();
				return null;
			}
			let created: ProfileDefinition;
			try {
				created = await utils.client.profiles.create.mutate({ name });
			} catch {
				reportProfileError();
				return null;
			}
			try {
				await refreshRegistry();
			} catch {
				markRegistryUnavailable();
			}
			return created;
		},
		[refreshRegistry, markRegistryUnavailable, utils],
	);
	const renameProfile = useCallback(
		(profileId: string, name: string) =>
			mutate(() => utils.client.profiles.rename.mutate({ profileId, name })),
		[mutate, utils],
	);
	const reorderProfiles = useCallback(
		(profileIds: string[]) =>
			mutate(() => utils.client.profiles.reorder.mutate({ profileIds })),
		[mutate, utils],
	);
	const moveMembers = useCallback(
		(members: ProfileMemberRef[], profileId: string) =>
			mutate(() => utils.client.profiles.move.mutate({ members, profileId })),
		[mutate, utils],
	);
	const deleteProfile = useCallback(
		(profileId: string, moveToDefault: boolean) =>
			mutate(() =>
				utils.client.profiles.delete.mutate({
					profileId,
					moveToDefault,
					confirmed: true,
				}),
			),
		[mutate, utils],
	);

	const registerPendingMember = useCallback(
		(member: ProfileMemberRef, context: ProfileSubmissionContext) => {
			const finishSubmission =
				member.kind === "session"
					? navigation.rememberWorkspaceSubmission(member.workspaceId, context)
					: undefined;
			const key = profileMemberKey(member);
			const token = Symbol();
			const next = new Map(pendingRef.current);
			next.set(key, { profileId: context.profileId, token });
			pendingRef.current = next;
			setPending(next);
			const current = registryRef.current;
			projectionRef.current = createProfileProjection(
				availableRef.current && current ? current.profiles : fallbackProfiles,
				availableRef.current && current ? current.memberships : noMemberships,
				new Map([...next].map(([key, value]) => [key, value.profileId])),
			);
			return () => {
				if (pendingRef.current.get(key)?.token !== token) return;
				finishSubmission?.();
				const remaining = new Map(pendingRef.current);
				remaining.delete(key);
				pendingRef.current = remaining;
				setPending(remaining);
				const registry = registryRef.current;
				projectionRef.current = createProfileProjection(
					availableRef.current && registry
						? registry.profiles
						: fallbackProfiles,
					availableRef.current && registry
						? registry.memberships
						: noMemberships,
					new Map([...remaining].map(([key, value]) => [key, value.profileId])),
				);
			};
		},
		[navigation.rememberWorkspaceSubmission],
	);

	const assignCreatedMember = useCallback(
		async (
			member: ProfileMemberRef,
			context: ProfileSubmissionContext,
		): Promise<ProfileAssignmentResult> => {
			const defaultId = projectionRef.current.defaultProfileId;
			const key = profileMemberKey(member);
			const settlePending = (profileId: string) => {
				const current = pendingRef.current.get(key);
				if (!current) return;
				const next = new Map(pendingRef.current);
				next.set(key, { ...current, profileId });
				pendingRef.current = next;
				setPending(next);
			};
			if (context.profileId === defaultId) {
				settlePending(defaultId);
				return { profileId: defaultId, assigned: true };
			}
			try {
				if (!availableRef.current) throw new Error("PROFILE_UNAVAILABLE");
				const result = await utils.client.profiles.move.mutate({
					members: [member],
					profileId: context.profileId,
				});
				// The committed result is authoritative. A later refresh failure
				// must never turn a successful assignment into a false Default result.
				const current = registryRef.current;
				if (current && current.revision > result.revision) {
					const canonical = createProfileProjection(
						current.profiles,
						current.memberships,
					);
					settlePending(
						member.kind === "project"
							? canonical.getProjectProfileId(member.projectKey)
							: canonical.getWorkspaceProfileId({
									id: member.workspaceId,
									hostId: member.hostId,
									projectId: null,
								}),
					);
					applyRegistry(current);
				} else settlePending(context.profileId);
				if (current && result.revision >= current.revision)
					applyRegistry({
						...current,
						revision: result.revision,
						memberships: [
							...current.memberships.filter(
								(entry) => profileMemberKey(entry.member) !== key,
							),
							{ member, profileId: context.profileId },
						],
					});
				void utils.profiles.get.invalidate();
				return {
					profileId: getWorkspaceOrProjectOwner(member),
					assigned: true,
				};
			} catch {
				// The service's atomic failure leaves a new member implicitly in
				// Default. This is object success, never the Host-create retry path.
				settlePending(defaultId);
				const current = registryRef.current;
				projectionRef.current = createProfileProjection(
					availableRef.current && current ? current.profiles : fallbackProfiles,
					availableRef.current && current ? current.memberships : noMemberships,
					new Map(
						[...pendingRef.current].map(([key, value]) => [
							key,
							value.profileId,
						]),
					),
				);
				setRecoveryMembers((current) => [
					...current.filter((candidate) => profileMemberKey(candidate) !== key),
					member,
				]);
				toast.error(
					i18n._({
						id: "profiles.errors.createdInDefault",
						message:
							"Your work was created, but its Profile could not be saved. It belongs to Default. Choose a Profile to finish organizing it.",
					}),
					{
						duration: Infinity,
						action: {
							label: i18n._({
								id: "profiles.actions.recoverAssignment",
								message: "Choose Profile",
							}),
							onClick: openManager,
						},
					},
				);
				return { profileId: defaultId, assigned: false };
			}

			function getWorkspaceOrProjectOwner(member: ProfileMemberRef) {
				return member.kind === "project"
					? projectionRef.current.getProjectProfileId(member.projectKey)
					: projectionRef.current.getWorkspaceProfileId({
							id: member.workspaceId,
							hostId: member.hostId,
							projectId: null,
						});
			}
		},
		[utils, applyRegistry, openManager],
	);

	const lastRecordedOpen = useRef<string | null>(null);
	const recordOpenedWorkspace = useCallback(
		(workspace: ProfileWorkspaceIdentity, openKey: string) => {
			if (
				!availableRef.current ||
				!navigation.isWorkspaceNavigationCurrent(workspace)
			)
				return;
			navigation.confirmWorkspaceOpened();
			const profileId = activeRef.current;
			const key = JSON.stringify([
				profileId,
				workspace.hostId,
				workspace.id,
				openKey,
			]);
			if (lastRecordedOpen.current === key) return;
			lastRecordedOpen.current = key;
			void utils.client.profiles.visit
				.mutate({
					profileId,
					hostId: workspace.hostId,
					workspaceId: workspace.id,
					visitedAt: Date.now(),
				})
				.then(
					() => utils.profiles.visits.invalidate({ profileId }),
					() => {
						if (lastRecordedOpen.current === key) reportProfileError();
					},
				);
		},
		[
			navigation.isWorkspaceNavigationCurrent,
			navigation.confirmWorkspaceOpened,
			utils,
		],
	);

	const value: ProfilesContextValue = {
		available,
		isReady,
		profiles,
		memberships,
		activeProfileId,
		defaultProfileId: projection.defaultProfileId,
		visits: available ? (visitsQuery.data ?? noVisits) : noVisits,
		...navigation,
		selectProfile,
		getProjectProfileId,
		getWorkspaceProfileId,
		isProjectVisible,
		isWorkspaceVisible,
		managerOpen,
		setManagerOpen,
		openManager,
		recoveryMembers,
		clearRecoveryMembers,
		createProfile,
		renameProfile,
		reorderProfiles,
		moveMembers,
		deleteProfile,
		assignCreatedMember,
		registerPendingMember,
		recordOpenedWorkspace,
	};
	return (
		<ProfilesContext.Provider value={value}>
			{children}
			<ProfileNavigationController />
			<ProfileManagerDialog />
		</ProfilesContext.Provider>
	);
}

export function useProfiles(): ProfilesContextValue {
	return useContext(ProfilesContext);
}
