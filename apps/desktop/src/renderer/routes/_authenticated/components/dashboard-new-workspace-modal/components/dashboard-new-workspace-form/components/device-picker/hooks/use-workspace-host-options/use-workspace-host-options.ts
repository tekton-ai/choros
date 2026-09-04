import { useLingui } from "@lingui/react/macro";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/local-host-service-provider";

export interface WorkspaceHostOption {
	id: string;
	name: string;
	isOnline: boolean;
}

interface UseWorkspaceHostOptionsResult {
	currentDeviceName: string | null;
	localHostId: string | null;
	localHostIsOnline: boolean | null;
	activeHostUrl: string | null;
	otherHosts: WorkspaceHostOption[];
}

export function useWorkspaceHostOptions(): UseWorkspaceHostOptionsResult {
	const { t } = useLingui();
	const { machineId, activeHostUrl } = useLocalHostService();
	return {
		currentDeviceName: machineId
			? t({
					id: "dashboard.newWorkspaceModal.devicePicker.thisDevice",
					message: "This device",
				})
			: null,
		localHostId: machineId,
		localHostIsOnline: activeHostUrl !== null,
		activeHostUrl,
		otherHosts: [],
	};
}
