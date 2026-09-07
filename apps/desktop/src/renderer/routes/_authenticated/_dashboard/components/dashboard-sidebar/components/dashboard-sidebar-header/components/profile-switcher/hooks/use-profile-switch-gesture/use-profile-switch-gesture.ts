import { type PointerEvent, useEffect, useRef } from "react";
import {
	advanceProfileGesture,
	createProfileGesture,
	type ProfileSwitchDirection,
} from "./profile-switch-gesture";

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
		const button = ref.current;
		if (!button) return;
		let wheelState = createProfileGesture();
		let lastWheelAt = -Infinity;
		const wheel = (event: WheelEvent) => {
			const now = performance.now();
			if (now - lastWheelAt > 220) wheelState = createProfileGesture();
			lastWheelAt = now;
			const scale =
				event.deltaMode === 1
					? 16
					: event.deltaMode === 2
						? window.innerWidth
						: 1;
			const direction = advanceProfileGesture(
				wheelState,
				event.deltaX * scale,
				event.deltaY * scale,
				event.ctrlKey,
			);
			if (
				!event.ctrlKey &&
				Math.abs(event.deltaX) > Math.abs(event.deltaY) * 1.5
			)
				event.preventDefault();
			if (direction) onSwitchRef.current(direction);
		};
		const additionalPointer = (event: globalThis.PointerEvent) => {
			if (pointer.current && event.pointerId !== pointer.current.id) {
				pointer.current.state.locked = true;
				suppressClick.current = true;
			}
		};
		button.addEventListener("wheel", wheel, { passive: false });
		window.addEventListener("pointerdown", additionalPointer, true);
		return () => {
			button.removeEventListener("wheel", wheel);
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
