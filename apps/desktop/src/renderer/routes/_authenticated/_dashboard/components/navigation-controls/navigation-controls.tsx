import { Tooltip, TooltipContent, TooltipTrigger } from "@choros/ui/tooltip";
import { useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { LuArrowLeft, LuArrowRight } from "react-icons/lu";
import { HotkeyLabel, useHotkey } from "renderer/hotkeys";
import { persistentHistory } from "renderer/lib/persistent-hash-history";
import { useProfiles } from "renderer/routes/_authenticated/providers/profile-provider";

export function NavigationControls() {
	useLocation();
	const { isReady } = useProfiles();
	// Profile changes update eligibility without changing the raw history cursor.
	const canGoBack = isReady && persistentHistory.canGoBack();
	const canGoForward = isReady && persistentHistory.canGoForward();
	const goBack = () => {
		if (isReady && persistentHistory.canGoBack()) persistentHistory.back();
	};
	const goForward = () => {
		if (isReady && persistentHistory.canGoForward())
			persistentHistory.forward();
	};

	useHotkey("NAVIGATE_BACK", goBack);
	useHotkey("NAVIGATE_FORWARD", goForward);

	useEffect(() => {
		const handleMouseUp = (event: MouseEvent) => {
			if (!isReady) return;
			if (event.button === 3) {
				event.preventDefault();
				if (persistentHistory.canGoBack()) persistentHistory.back();
			} else if (event.button === 4) {
				event.preventDefault();
				if (persistentHistory.canGoForward()) persistentHistory.forward();
			}
		};

		window.addEventListener("mouseup", handleMouseUp);
		return () => window.removeEventListener("mouseup", handleMouseUp);
	}, [isReady]);

	return (
		<div className="flex items-center">
			<Tooltip delayDuration={1000}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={goBack}
						disabled={!canGoBack}
						className="no-drag flex items-center justify-center size-7 rounded-md text-muted-foreground hover:bg-fill-hover transition-colors disabled:opacity-30 disabled:pointer-events-none"
					>
						<LuArrowLeft className="size-4" strokeWidth={1.5} />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<HotkeyLabel fallbackLabel="Go back" id="NAVIGATE_BACK" />
				</TooltipContent>
			</Tooltip>

			<Tooltip delayDuration={1000}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={goForward}
						disabled={!canGoForward}
						className="no-drag flex items-center justify-center size-7 rounded-md text-muted-foreground hover:bg-fill-hover transition-colors disabled:opacity-30 disabled:pointer-events-none"
					>
						<LuArrowRight className="size-4" strokeWidth={1.5} />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<HotkeyLabel fallbackLabel="Go forward" id="NAVIGATE_FORWARD" />
				</TooltipContent>
			</Tooltip>
		</div>
	);
}
