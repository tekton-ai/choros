export function resolveHostUrl(args: {
	hostId: string;
	machineId: string | null;
	activeHostUrl: string | null;
}): string | null {
	return args.hostId === args.machineId ? args.activeHostUrl : null;
}
