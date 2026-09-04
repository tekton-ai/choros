import { useMemo } from "react";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/local-host-service-provider";

export function useHostUrl(hostId: string | null | undefined): string | null {
	const { machineId, activeHostUrl } = useLocalHostService();
	return useMemo(() => {
		if (hostId === undefined) return null;
		return hostId === null || hostId === machineId ? activeHostUrl : null;
	}, [activeHostUrl, hostId, machineId]);
}

export function useHostUrls(
	hostIds: string[],
): Array<{ hostId: string; url: string | null; isLocal: boolean }> {
	const { machineId, activeHostUrl } = useLocalHostService();
	return useMemo(
		() =>
			hostIds.map((hostId) => ({
				hostId,
				url: hostId === machineId ? activeHostUrl : null,
				isLocal: hostId === machineId,
			})),
		[activeHostUrl, hostIds, machineId],
	);
}
