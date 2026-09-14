import { type PointerEvent, useEffect, useRef } from "react";
import {
	advanceProfileGesture,
	createProfileGesture,
	type ProfileSwitchDirection,
} from "../../../../../../utils/profile-switch-gesture/profile-switch-gesture";

export function useProfileSwitchGesture(
	onSwitch: (direction: ProfileSwitchDirection) => void,
) {
	const ref = useRef<HTMLButtonElement>(null);
	const onSwitchRef = useRef(onSwitch);
	onSwitchRef.current = onSwitch;
	const pointer = useRef<{
		id: number;
		x: number;
		y: number;
		state: ReturnType<typeof createProfileGesture>;
	} | null>(null);
	const suppressClick = useRef(false);
	useEffect(() => {
		const additionalPointer = (event: globalThis.PointerEvent) => {
			if (pointer.current && event.pointerId !== pointer.current.id) {
				pointer.current.state.locked = true;
				suppressClick.current = true;
			}
		};
		window.addEventListener("pointerdown", additionalPointer, true);
		return () => {
			window.removeEventListener("pointerdown", additionalPointer, true);
		};
	}, []);
	const finishPointer = (event: PointerEvent<HTMLButtonElement>) => {
		if (pointer.current?.id !== event.pointerId) return;
		pointer.current = null;
		if (event.currentTarget.hasPointerCapture(event.pointerId))
			event.currentTarget.releasePointerCapture(event.pointerId);
	};
	return {
		ref,
		onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
			// Radix normally opens on down. Defer to click so a swipe can complete.
			if (event.button !== 0) return;
			event.preventDefault();
			event.currentTarget.focus();
			if (!event.isPrimary || event.ctrlKey || pointer.current) {
				if (pointer.current) pointer.current.state.locked = true;
				suppressClick.current = true;
				return;
			}
			suppressClick.current = false;
			pointer.current = {
				id: event.pointerId,
				x: event.clientX,
				y: event.clientY,
				state: createProfileGesture(),
			};
			event.currentTarget.setPointerCapture(event.pointerId);
		},
		onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
			const active = pointer.current;
			if (!active || active.id !== event.pointerId) return;
			const dx = active.x - event.clientX;
			const dy = active.y - event.clientY;
			active.x = event.clientX;
			active.y = event.clientY;
			const direction = advanceProfileGesture(
				active.state,
				dx,
				dy,
				event.ctrlKey,
			);
			if (active.state.locked) suppressClick.current = true;
			if (direction) onSwitchRef.current(direction);
		},
		onPointerUp: finishPointer,
		onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => {
			suppressClick.current = true;
			finishPointer(event);
		},
		consumeClick: () => {
			const suppressed = suppressClick.current;
			suppressClick.current = false;
			return suppressed;
		},
	};
}
