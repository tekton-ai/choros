import { describe, expect, it } from "bun:test";
import {
	adjacentProfileId,
	advanceProfileGesture,
	createProfileGesture,
} from "./profile-switch-gesture";

describe("Profile switch gestures", () => {
	it("accumulates horizontal input and commits only once through inertia and reversal", () => {
		const gesture = createProfileGesture();
		expect(advanceProfileGesture(gesture, 25, 2)).toBeNull();
		expect(advanceProfileGesture(gesture, 20, 1)).toBe(1);
		expect(advanceProfileGesture(gesture, 150, 0)).toBeNull();
		expect(advanceProfileGesture(gesture, -300, 0)).toBeNull();
		expect(advanceProfileGesture(createProfileGesture(), -45, 0)).toBe(-1);
	});

	it("never converts a vertical or zoom gesture into a later horizontal switch", () => {
		const vertical = createProfileGesture();
		expect(advanceProfileGesture(vertical, 2, 12)).toBeNull();
		expect(advanceProfileGesture(vertical, 100, 0)).toBeNull();
		const pinch = createProfileGesture();
		expect(advanceProfileGesture(pinch, 100, 0, true)).toBeNull();
		expect(advanceProfileGesture(pinch, 100, 0)).toBeNull();
		const diagonal = createProfileGesture();
		expect(advanceProfileGesture(diagonal, 45, 40)).toBeNull();
	});

	it("uses supplied order without wrapping or inventing a target", () => {
		const ids = ["personal", "default", "work"];
		expect(adjacentProfileId(ids, "default", -1)).toBe("personal");
		expect(adjacentProfileId(ids, "default", 1)).toBe("work");
		expect(adjacentProfileId(ids, "personal", -1)).toBeNull();
		expect(adjacentProfileId(ids, "work", 1)).toBeNull();
		expect(adjacentProfileId(["default"], "default", 1)).toBeNull();
		expect(adjacentProfileId(ids, "deleted", 1)).toBeNull();
	});
});
