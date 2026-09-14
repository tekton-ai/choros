import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { useProfiles } from "renderer/routes/_authenticated/providers/profile-provider";
import { useWorkspaceSidebarStore } from "renderer/stores/workspace-sidebar-state";
import { useDashboardSidebarDnd } from "../../hooks/use-sidebar-dnd";
import {
	adjacentProfileId,
	advanceProfileGesture,
	createProfileGesture,
} from "../../utils/profile-switch-gesture/profile-switch-gesture";

interface WheelGesture {
	state: ReturnType<typeof createProfileGesture>;
	lastWheelAt: number;
	claimed: boolean;
}

// Collapsing the sidebar moves it between layout branches. Keep the current
// wheel sequence across that remount, without keeping any listeners alive.
const wheelGestures = new WeakMap<Document, WheelGesture>();

function hasOwnWheelTarget(target: EventTarget | null, root: HTMLElement) {
	if (!(target instanceof Element) || !root.contains(target)) return true;
	for (
		let element: Element | null = target;
		element && element !== root;
		element = element.parentElement
	) {
		if (element.matches('[role="menu"], [role="dialog"], [role="listbox"]'))
			return true;
		if (element.scrollWidth > element.clientWidth) {
			const overflow = getComputedStyle(element).overflowX;
			// A nested scroller owns the whole gesture, including its edge inertia.
			if (overflow === "auto" || overflow === "scroll") return true;
		}
	}
	return false;
}

export function DashboardSidebarGestureArea({
	children,
}: {
	children: ReactNode;
}) {
	const rootRef = useRef<HTMLDivElement>(null);
	const { activeId } = useDashboardSidebarDnd();
	const { profiles, activeProfileId, available, isReady, selectProfile } =
		useProfiles();
	const profileIds = useMemo(
		() => profiles.map((profile) => profile.id),
		[profiles],
	);
	const current = useRef({
		activeId,
		activeProfileId,
		available,
		isReady,
		selectProfile,
		profileIds,
	});
	current.current = {
		activeId,
		activeProfileId,
		available,
		isReady,
		selectProfile,
		profileIds,
	};

	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;
		const gesture = wheelGestures.get(root.ownerDocument) ?? {
			state: createProfileGesture(),
			lastWheelAt: -Infinity,
			claimed: false,
		};
		wheelGestures.set(root.ownerDocument, gesture);
		let pointerDown = false;
		const disqualify = () => {
			gesture.state.locked = true;
			gesture.claimed = false;
		};
		const onPointerDown = (event: PointerEvent) => {
			if (event.isPrimary) pointerDown = true;
			disqualify();
		};
		const onPointerUp = (event: PointerEvent) => {
			if (event.isPrimary) pointerDown = false;
		};
		const onBlur = () => {
			pointerDown = false;
			disqualify();
		};
		const onWheel = (event: WheelEvent) => {
			const now = performance.now();
			if (now - gesture.lastWheelAt > 220) {
				gesture.state = createProfileGesture();
				gesture.claimed = false;
			}
			gesture.lastWheelAt = now;
			const snapshot = current.current;
			if (
				!snapshot.available ||
				!snapshot.isReady ||
				snapshot.activeId !== null ||
				useWorkspaceSidebarStore.getState().isResizing ||
				pointerDown ||
				event.buttons !== 0 ||
				event.ctrlKey ||
				event.defaultPrevented ||
				hasOwnWheelTarget(event.target, root)
			) {
				disqualify();
				return;
			}
			const scale =
				event.deltaMode === 1
					? 16
					: event.deltaMode === 2
						? window.innerWidth
						: 1;
			const direction = advanceProfileGesture(
				gesture.state,
				event.deltaX * scale,
				event.deltaY * scale,
			);
			if (direction) gesture.claimed = true;
			if (
				(gesture.claimed || !gesture.state.locked) &&
				Math.abs(event.deltaX) > Math.abs(event.deltaY) * 1.5
			)
				event.preventDefault();
			if (!direction) return;
			const target = adjacentProfileId(
				snapshot.profileIds,
				snapshot.activeProfileId,
				direction,
			);
			if (target) snapshot.selectProfile(target);
		};
		// This DOM boundary excludes portalled menus and survives Profile changes.
		root.addEventListener("wheel", onWheel, { passive: false });
		window.addEventListener("pointerdown", onPointerDown, true);
		window.addEventListener("pointerup", onPointerUp, true);
		window.addEventListener("pointercancel", onPointerUp, true);
		window.addEventListener("blur", onBlur);
		return () => {
			root.removeEventListener("wheel", onWheel);
			window.removeEventListener("pointerdown", onPointerDown, true);
			window.removeEventListener("pointerup", onPointerUp, true);
			window.removeEventListener("pointercancel", onPointerUp, true);
			window.removeEventListener("blur", onBlur);
		};
	}, []);

	return (
		<div
			ref={rootRef}
			data-dashboard-sidebar=""
			className="flex h-full flex-col border-r border-border bg-sidebar dark:bg-muted/35"
		>
			{children}
		</div>
	);
}
