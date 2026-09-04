import { cn } from "@choros/ui/utils";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedStarButton } from "renderer/components/animated-star-button";
import {
	canActivateStarAction,
	useGithubStarAction,
	useJustStarredWindow,
} from "renderer/hooks/use-github-star-action";

interface GitHubStarPillProps {
	className?: string;
	/** Analytics surface tag; defaults to "empty_state" for the original callers. */
	surface?: "empty_state" | "new_workspace";
	/**
	 * Keep the pill's layout box mounted (just faded to invisible) instead of
	 * unmounting it once starred. The empty-state screens sit at the bottom of
	 * a plain block, so a height collapse there is harmless; the new-workspace
	 * screen centers its content with `justify-center`, where that same
	 * collapse re-centers everything above it. Off by default so the two
	 * existing callers keep their original unmount-on-hide behavior.
	 */
	reserveSpace?: boolean;
}

/**
 * Small, always-optional "Star Choros on GitHub" pill for the empty
 * "no pane open" screens (v1 EmptyTabView and v2 WorkspaceEmptyState) and
 * the new-workspace screen. Renders straight from live `state`, with no
 * nag-suppression layer — unlike the sidebar card/toast, this is a low-key
 * status indicator, not an interruptive campaign, so it's allowed to be
 * fully truthful: it only shows while `state` is confirmed "not_starred"
 * (a "loading" or "unknown" read isn't trustworthy enough to act on), hides
 * the instant `state` is "starred", and reappears the instant a later
 * unstar is confirmed, without waiting on any mute grace window. It briefly
 * stays mounted past that point so the confetti/label animation on a fresh
 * star has time to play, then dissolves out (fade + soft blur) instead of
 * vanishing instantly.
 */
export function GitHubStarPill({
	className,
	reserveSpace = false,
}: GitHubStarPillProps) {
	const { state, activate, isBusy } = useGithubStarAction();
	const celebrating = useJustStarredWindow(state);

	if (state === "loading" && !reserveSpace) return null;

	const isVisible = canActivateStarAction(state) || celebrating;

	const handleClick = activate;

	if (reserveSpace) {
		// Always mounted so the button's box keeps occupying its slot — only
		// opacity/interactivity change, never the layout.
		return (
			<motion.div
				animate={{ opacity: isVisible ? 1 : 0 }}
				transition={{ duration: 0.32, ease: "easeOut" }}
				style={{ pointerEvents: isVisible ? "auto" : "none" }}
				aria-hidden={!isVisible}
				inert={!isVisible}
				className={cn("flex items-center justify-center", className)}
			>
				<AnimatedStarButton
					state={state}
					busy={isBusy}
					onActivate={handleClick}
				/>
			</motion.div>
		);
	}

	return (
		<AnimatePresence>
			{isVisible && (
				<motion.div
					key="star-pill"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0, scale: 0.92, filter: "blur(3px)" }}
					transition={{ duration: 0.32, ease: "easeOut" }}
					className={cn("flex items-center justify-center", className)}
				>
					<AnimatedStarButton
						state={state}
						busy={isBusy}
						onActivate={handleClick}
					/>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
