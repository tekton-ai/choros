export function canEnterLocalProduct({
	hasSession,
	hasStoredToken,
	skipValidation,
}: {
	hasSession: boolean;
	hasStoredToken: boolean;
	skipValidation: boolean;
}): boolean {
	return skipValidation || hasSession || hasStoredToken;
}
