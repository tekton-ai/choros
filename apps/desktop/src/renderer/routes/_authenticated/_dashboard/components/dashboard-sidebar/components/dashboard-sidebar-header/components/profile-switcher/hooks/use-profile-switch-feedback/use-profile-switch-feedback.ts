import { useLayoutEffect, useRef, useState } from "react";

export function useProfileSwitchFeedback(
	profileId: string,
	index: number,
	isCollapsed: boolean,
) {
	const labelRef = useRef<HTMLSpanElement>(null);
	const previous = useRef({ profileId, index });
	const [showFeedback, setShowFeedback] = useState(false);
	const motionPreference = useRef<MediaQueryList | null>(null);

	useLayoutEffect(() => {
		const changed = previous.current.profileId !== profileId;
		const direction = index < previous.current.index ? -1 : 1;
		previous.current = { profileId, index };
		setShowFeedback(changed && isCollapsed);
		if (!changed) return;

		motionPreference.current ??= window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		);
		const preference = motionPreference.current;
		const animation = preference.matches
			? undefined
			: labelRef.current?.animate(
					[
						{ opacity: 0, transform: `translateX(${direction * 6}px)` },
						{ opacity: 1, transform: "translateX(0)" },
					],
					{ duration: 140, easing: "ease-out" },
				);
		const onMotionPreferenceChange = () => {
			if (preference.matches) animation?.cancel();
		};
		preference.addEventListener("change", onMotionPreferenceChange);
		const timer = isCollapsed
			? window.setTimeout(() => setShowFeedback(false), 1200)
			: undefined;
		return () => {
			animation?.cancel();
			preference.removeEventListener("change", onMotionPreferenceChange);
			if (timer !== undefined) window.clearTimeout(timer);
		};
	}, [profileId, index, isCollapsed]);

	return { labelRef, showFeedback };
}
