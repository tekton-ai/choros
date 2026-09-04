const secrets = new Map<string, string>();
let clientMachineId: string | null = null;

export function setClientMachineId(machineId: string): void {
	clientMachineId = machineId;
}

export function setHostServiceSecret(hostUrl: string, secret: string): void {
	secrets.set(hostUrl, secret);
}

export function removeHostServiceSecret(hostUrl: string): void {
	secrets.delete(hostUrl);
}

export function getHostServiceHeaders(hostUrl: string): Record<string, string> {
	const headers: Record<string, string> = clientMachineId
		? { "x-choros-client-machine-id": clientMachineId }
		: {};
	const secret = secrets.get(hostUrl);
	if (secret) headers.Authorization = `Bearer ${secret}`;
	return headers;
}

export function getHostServiceWsToken(hostUrl: string): string | null {
	return secrets.get(hostUrl) ?? null;
}

export function getHostServiceWsUrlParams(): null {
	return null;
}
