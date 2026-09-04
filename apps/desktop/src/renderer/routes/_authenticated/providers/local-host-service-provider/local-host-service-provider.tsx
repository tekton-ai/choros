import { reconnectEventBusIfDown } from "@choros/workspace-client";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
} from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	setClientMachineId,
	setHostServiceSecret,
} from "renderer/lib/host-service-auth";
import type { HostServiceAvailabilityStatus } from "renderer/lib/host-service-unavailable";

interface LocalHostServiceContextValue {
	machineId: string;
	activeHostUrl: string | null;
	hostServiceStatus: HostServiceAvailabilityStatus;
	waitForHostReady: (timeoutMs?: number) => Promise<string | null>;
}

const LocalHostServiceContext =
	createContext<LocalHostServiceContextValue | null>(null);

export function LocalHostServiceProvider({
	children,
}: {
	children: ReactNode;
}) {
	const utils = electronTrpc.useUtils();
	const { data: machineIdData } = electronTrpc.device.getMachineId.useQuery(
		undefined,
		{ staleTime: Number.POSITIVE_INFINITY },
	);

	useEffect(() => {
		if (machineIdData?.machineId) setClientMachineId(machineIdData.machineId);
	}, [machineIdData]);

	const { data: activeConnection } =
		electronTrpc.hostServiceCoordinator.getConnection.useQuery(undefined, {
			refetchInterval: 5_000,
		});
	const { data: processStatus } =
		electronTrpc.hostServiceCoordinator.getProcessStatus.useQuery(undefined, {
			refetchInterval: activeConnection?.port ? false : 1_000,
		});

	electronTrpc.hostServiceCoordinator.onStatusChange.useSubscription(
		undefined,
		{
			onData: () => {
				utils.hostServiceCoordinator.getConnection.invalidate();
				utils.hostServiceCoordinator.getProcessStatus.invalidate();
			},
		},
	);

	useEffect(() => {
		if (!activeConnection?.port) return;
		reconnectEventBusIfDown(`http://127.0.0.1:${activeConnection.port}`);
	}, [activeConnection]);

	const waitForHostReady = useCallback(
		async (timeoutMs = 20_000): Promise<string | null> => {
			const tryGetHostUrl = async (): Promise<string | null> => {
				try {
					const connection =
						await utils.hostServiceCoordinator.getConnection.fetch();
					if (!connection?.port) return null;
					const hostUrl = `http://127.0.0.1:${connection.port}`;
					if (connection.secret) {
						setHostServiceSecret(hostUrl, connection.secret);
					}
					return hostUrl;
				} catch (error) {
					console.warn("[host-service] connection poll failed", error);
					return null;
				}
			};

			const deadline = Date.now() + timeoutMs;
			while (Date.now() < deadline) {
				const hostUrl = await tryGetHostUrl();
				if (hostUrl) return hostUrl;
				await new Promise((resolve) => setTimeout(resolve, 1_000));
			}
			return tryGetHostUrl();
		},
		[utils],
	);

	const value = useMemo<LocalHostServiceContextValue | null>(() => {
		if (!machineIdData) return null;
		const hostServiceStatus: HostServiceAvailabilityStatus =
			activeConnection?.port ? "running" : (processStatus?.status ?? "unknown");
		const activeHostUrl = activeConnection?.port
			? `http://127.0.0.1:${activeConnection.port}`
			: null;
		if (activeHostUrl && activeConnection?.secret) {
			setHostServiceSecret(activeHostUrl, activeConnection.secret);
		}
		return {
			machineId: machineIdData.machineId,
			activeHostUrl,
			hostServiceStatus,
			waitForHostReady,
		};
	}, [
		activeConnection,
		machineIdData,
		processStatus?.status,
		waitForHostReady,
	]);

	if (!value) return null;
	return (
		<LocalHostServiceContext.Provider value={value}>
			{children}
		</LocalHostServiceContext.Provider>
	);
}

export function useLocalHostService() {
	const context = useContext(LocalHostServiceContext);
	if (!context) {
		throw new Error(
			"useLocalHostService must be used within LocalHostServiceProvider",
		);
	}
	return context;
}
