import { useCallback, useEffect, useRef } from "react";

/** Prevent a late Host completion from changing a reopened modal's local UI. */
export function useProjectModalRequest(requestId: string, open: boolean) {
	const current = useRef({ requestId, open, mounted: true });
	current.current.requestId = requestId;
	current.current.open = open;
	useEffect(() => {
		current.current.mounted = true;
		return () => {
			current.current.mounted = false;
		};
	}, []);
	return useCallback(
		(expectedRequestId: string) =>
			current.current.mounted &&
			current.current.open &&
			current.current.requestId === expectedRequestId,
		[],
	);
}
