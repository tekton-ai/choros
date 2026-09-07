import type { ExternalApp } from "@choros/local-db";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import {
	useLocation,
	useMatchRoute,
	useNavigate,
} from "@tanstack/react-router";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ProfileNameDialog } from "renderer/routes/_authenticated/components/profile-manager-dialog/components/profile-name-dialog";
import { useCollections } from "renderer/routes/_authenticated/providers/collections-provider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/host-workspaces-provider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/local-host-service-provider";
import { useProfiles } from "renderer/routes/_authenticated/providers/profile-provider";
import { getV2WorkspaceDisplayName } from "renderer/utils/get-v2-workspace-display-name";
import type { CommandContext } from "./types";

const Context = createContext<CommandContext | null>(null);

export function CommandContextProvider({ children }: { children: ReactNode }) {
	const location = useLocation();
	const matchRoute = useMatchRoute();
	const navigate = useNavigate();
	const collections = useCollections();
	const { activeHostUrl, hostServiceStatus, machineId } = useLocalHostService();
	const {
		activeProfileId,
		available,
		isReady: areProfilesReady,
		profiles,
		isWorkspaceVisible,
		selectProfile,
		openManager,
	} = useProfiles();
	const [createProfileOpen, setCreateProfileOpen] = useState(false);
	const openCreateProfile = useCallback(() => setCreateProfileOpen(true), []);
	const activeProfileIndex = profiles.findIndex(
		(profile) => profile.id === activeProfileId,
	);

	const navigateTo = useCallback(
		(path: string) => {
			void navigate({ to: path });
		},
		[navigate],
	);

	const v2Match = matchRoute({ to: "/v2-workspace/$workspaceId", fuzzy: true });
	const v2WorkspaceId = v2Match !== false ? v2Match.workspaceId : null;

	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	const v2Workspace = useMemo(() => {
		if (!areProfilesReady || !v2WorkspaceId) return null;
		const workspace = hostWorkspaces.find((w) => w.id === v2WorkspaceId);
		if (!workspace || !isWorkspaceVisible(workspace)) return null;
		return {
			id: workspace.id,
			name: getV2WorkspaceDisplayName(workspace),
			projectId: workspace.projectId,
			type: workspace.type,
			hostId: workspace.hostId,
		};
	}, [areProfilesReady, hostWorkspaces, isWorkspaceVisible, v2WorkspaceId]);
	const projectId = v2Workspace?.projectId ?? null;

	const { data: preferredAppRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sp: collections.v2SidebarProjects })
				.where(({ sp }) => eq(sp.projectId, projectId ?? ""))
				.select(({ sp }) => ({ defaultOpenInApp: sp.defaultOpenInApp })),
		[collections, projectId],
	);
	const preferredOpenInApp =
		(preferredAppRows[0]?.defaultOpenInApp as ExternalApp | null | undefined) ??
		undefined;

	const { data: notificationSoundsMuted = false } =
		electronTrpc.settings.getNotificationSoundsMuted.useQuery();

	const context = useMemo<CommandContext>(
		() => ({
			route: { pathname: location.pathname, params: {} },
			profile: {
				id: activeProfileId,
				name: profiles[activeProfileIndex]?.name ?? "",
				available: available && areProfilesReady,
				previousId:
					activeProfileIndex > 0
						? (profiles[activeProfileIndex - 1]?.id ?? null)
						: null,
				nextId:
					activeProfileIndex >= 0
						? (profiles[activeProfileIndex + 1]?.id ?? null)
						: null,
				select: selectProfile,
				openCreate: openCreateProfile,
				openManager,
			},
			workspace: v2Workspace
				? {
						id: v2Workspace.id,
						name: v2Workspace.name,
						projectId: v2Workspace.projectId ?? undefined,
						workspaceType: v2Workspace.type,
						hostId: v2Workspace.hostId ?? undefined,
						preferredOpenInApp,
					}
				: null,
			activeHostUrl,
			hostServiceStatus,
			localMachineId: machineId ?? null,
			notificationSoundsMuted,
			navigate: navigateTo,
		}),
		[
			location.pathname,
			activeProfileId,
			activeProfileIndex,
			available,
			areProfilesReady,
			profiles,
			selectProfile,
			openCreateProfile,
			openManager,
			v2Workspace,
			preferredOpenInApp,
			activeHostUrl,
			hostServiceStatus,
			machineId,
			notificationSoundsMuted,
			navigateTo,
		],
	);

	return (
		<Context.Provider value={context}>
			{children}
			<ProfileNameDialog
				open={createProfileOpen}
				onOpenChange={setCreateProfileOpen}
			/>
		</Context.Provider>
	);
}

export function useCommandContext(): CommandContext {
	const ctx = useContext(Context);
	if (!ctx) {
		throw new Error(
			"useCommandContext must be used within CommandContextProvider",
		);
	}
	return ctx;
}
