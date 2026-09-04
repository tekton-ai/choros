import { useLingui } from "@lingui/react/macro";
import { useEffect, useReducer } from "react";
import { AnimatedStarButton } from "renderer/components/animated-star-button";
import {
	canActivateStarAction,
	useGithubStarAction,
	useJustStarredWindow,
} from "renderer/hooks/use-github-star-action";

import { useStarNagStore } from "renderer/stores/star-nag";
import type { SidebarCardEntry } from "../../types";

/**
 * Offers a GitHub star once the user has created enough workspaces to have
 * proven they're getting real use out of the app.
 */
export function useStarNagCard({
	isCollapsed,
}: {
	isCollapsed?: boolean;
}): SidebarCardEntry | null {
	const { t } = useLingui();
	const shouldShow = useStarNagStore((s) => s.shouldShowThresholdCard());
	const deferredUntil = useStarNagStore((s) => s.deferredUntil);
	const dismiss = useStarNagStore((s) => s.dismiss);

	// Avoid a redundant GitHub status request while the sidebar is collapsed.
	const { state, activate, isBusy } = useGithubStarAction({
		enabled: !isCollapsed,
	});

	// shouldShowThresholdCard() is only re-evaluated when the store itself
	// changes — a cooldown expiring is a pure passage of time, not a store
	// write, so without this the card stays hidden past its cooldown until
	// something unrelated happens to write to the store.
	const [, forceRecheck] = useReducer((n: number) => n + 1, 0);
	useEffect(() => {
		if (!deferredUntil) return;
		const msUntilExpiry = deferredUntil - Date.now();
		if (msUntilExpiry <= 0) return;
		const timer = setTimeout(forceRecheck, msUntilExpiry);
		return () => clearTimeout(timer);
	}, [deferredUntil]);

	// Starring calls markCompleted() internally, which flips shouldShow to
	// false immediately — without this, the card would unmount before the
	// AnimatedStarButton's confetti/label animation gets a chance to play.
	const celebrating = useJustStarredWindow(state);

	if (isCollapsed || !(shouldShow || celebrating)) return null;

	// A "loading" or "unknown" read isn't trustworthy enough to act on, so the
	// button doesn't render for those — the card chrome (title, description,
	// dismiss) stays up regardless, same pattern as StarNagToast.
	const canStar = canActivateStarAction(state);
	const showButton = canStar || celebrating;

	return {
		id: "star-nag",
		title: t({
			id: "components.starNagCard.title",
			message: "Enjoying Choros?",
		}),
		description: t({
			id: "components.starNagCard.description",
			message:
				"Choros is open source. If it's helped you today, a GitHub star helps other developers find it.",
		}),
		onDismiss: dismiss,
		children: showButton ? (
			<AnimatedStarButton
				state={state}
				busy={isBusy}
				onActivate={activate}
				className="mt-3 w-full justify-center"
			/>
		) : undefined,
	};
}
