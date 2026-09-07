import { useEffect, useRef } from "react";
import { useProfiles } from "renderer/routes/_authenticated/providers/profile-provider";
import { createProjectCompletion } from "./project-completion";

/** Selection/navigation belongs to a waiting UI, never to Host finalization. */
export function useProjectCompletion(onSelect: (projectId: string) => void) {
	const profiles = useProfiles();
	const current = useRef({ profiles, onSelect });
	current.current = { profiles, onSelect };
	const completionRef = useRef<ReturnType<
		typeof createProjectCompletion
	> | null>(null);
	if (!completionRef.current) {
		completionRef.current = createProjectCompletion(() => current.current);
	}
	const completion = completionRef.current;
	useEffect(() => () => completion.cancel(), [completion]);
	return completion;
}
