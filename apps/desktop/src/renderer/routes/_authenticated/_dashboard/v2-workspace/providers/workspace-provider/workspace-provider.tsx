import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useRef,
} from "react";
import type { HostWorkspaceItem } from "renderer/hooks/host-workspaces/use-host-workspaces";
import {
	getHostServiceHeaders,
	getHostServiceWsToken,
} from "renderer/lib/host-service-auth";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/local-host-service-provider";
import { WorkspaceTrpcProvider } from "../workspace-trpc-provider";
import { WorkspaceHostGate } from "./components/workspace-host-gate";
import { WorkspaceLocalHostPendingState } from "./components/workspace-local-host-pending-state";

interface WorkspaceContextValue {
	workspace: HostWorkspaceItem;
	hostUrl: string;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
	workspace,
	children,
}: {
	workspace: HostWorkspaceItem;
	children: ReactNode;
}) {
	const { machineId, activeHostUrl } = useLocalHostService();
	const lastLocalHostUrlRef = useRef<string | null>(null);
	useEffect(() => {
		if (activeHostUrl) lastLocalHostUrlRef.current = activeHostUrl;
	}, [activeHostUrl]);
	const hostUrl =
		workspace.hostId === machineId
			? (activeHostUrl ?? lastLocalHostUrlRef.current)
			: null;

	if (!hostUrl) {
		return <WorkspaceLocalHostPendingState />;
	}
	return (
		<WorkspaceContext.Provider value={{ workspace, hostUrl }}>
			<WorkspaceTrpcProvider
				cacheKey={workspace.id}
				key={workspace.id}
				hostUrl={hostUrl}
				headers={() => getHostServiceHeaders(hostUrl)}
				wsToken={() => getHostServiceWsToken(hostUrl)}
			>
				<WorkspaceHostGate workspace={workspace}>{children}</WorkspaceHostGate>
			</WorkspaceTrpcProvider>
		</WorkspaceContext.Provider>
	);
}

export function useWorkspace(): WorkspaceContextValue {
	const context = useContext(WorkspaceContext);
	if (!context) {
		throw new Error("useWorkspace must be used within WorkspaceProvider");
	}
	return context;
}
