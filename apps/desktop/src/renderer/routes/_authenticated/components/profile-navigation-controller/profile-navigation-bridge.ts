// IPC can arrive before authentication/providers mount. Keep only the newest
// explicit intent; it must not be mistaken for ordinary browser history.
let pendingTarget: string | null = null;
let targetHandler: ((path: string) => void) | null = null;

export function requestProfileTarget(path: string): void {
	if (targetHandler) targetHandler(path);
	else pendingTarget = path;
}

export function registerProfileTargetHandler(
	handler: (path: string) => void,
): () => void {
	targetHandler = handler;
	if (pendingTarget !== null) {
		const path = pendingTarget;
		pendingTarget = null;
		handler(path);
	}
	return () => {
		if (targetHandler === handler) targetHandler = null;
	};
}
