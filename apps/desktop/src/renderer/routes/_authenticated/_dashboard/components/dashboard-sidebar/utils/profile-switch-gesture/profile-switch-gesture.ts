export type ProfileSwitchDirection = -1 | 1;

export interface ProfileGestureState {
	x: number;
	y: number;
	locked: boolean;
}

export function createProfileGesture(): ProfileGestureState {
	return { x: 0, y: 0, locked: false };
}

/** A gesture commits once; vertical and zoom gestures stay disqualified. */
export function advanceProfileGesture(
	state: ProfileGestureState,
	deltaX: number,
	deltaY: number,
	zoom = false,
): ProfileSwitchDirection | null {
	if (zoom) state.locked = true;
	if (state.locked) return null;
	state.x += deltaX;
	state.y += deltaY;
	const x = Math.abs(state.x);
	const y = Math.abs(state.y);
	if (y >= 8 && y > x * 1.5) {
		state.locked = true;
		return null;
	}
	if (x < 40 || x <= y * 1.5) return null;
	state.locked = true;
	return state.x > 0 ? 1 : -1;
}

export function adjacentProfileId(
	profileIds: readonly string[],
	activeProfileId: string,
	direction: ProfileSwitchDirection,
): string | null {
	const index = profileIds.indexOf(activeProfileId);
	return index < 0 ? null : (profileIds[index + direction] ?? null);
}
