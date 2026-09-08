import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { useSettingsStore } from "./settings-state";

const storageKey = "settings-navigation";
const originalState = useSettingsStore.getState();
const originalStorage = sessionStorage.getItem(storageKey);

afterAll(() => {
	useSettingsStore.setState(originalState, true);
	if (originalStorage === null) sessionStorage.removeItem(storageKey);
	else sessionStorage.setItem(storageKey, originalStorage);
});

beforeEach(() => {
	useSettingsStore.setState(useSettingsStore.getInitialState(), true);
	sessionStorage.clear();
	localStorage.removeItem(storageKey);
});

describe("Settings return navigation", () => {
	test("direct Settings entry has a valid local-product fallback", () => {
		expect(useSettingsStore.getState().originRoute).toEqual({
			to: "/v2-workspaces",
			search: {},
			hash: "",
		});
	});

	test("persists only the return target in window-session storage", () => {
		const originRoute = {
			to: "/v2-workspaces",
			search: { q: "release review", view: "list", projects: "project-a" },
			hash: "recent",
		};
		useSettingsStore.getState().setOriginRoute(originRoute);
		useSettingsStore.getState().setSearchQuery("terminal");
		useSettingsStore.getState().openSettings("experimental");

		const persisted = sessionStorage.getItem(storageKey);
		if (persisted === null)
			throw new Error("Settings origin was not persisted");
		expect(JSON.parse(persisted)).toEqual({
			state: { originRoute },
			version: expect.any(Number),
		});
		expect(localStorage.getItem(storageKey)).toBeNull();
	});

	test("rehydrates pathname, search and anchor without restoring transient Settings UI", async () => {
		const originRoute = {
			to: "/new-workspace",
			search: { projectId: "project-a", session: false },
			hash: "draft",
		};
		useSettingsStore.getState().setOriginRoute(originRoute);
		const persisted = sessionStorage.getItem(storageKey);
		if (persisted === null)
			throw new Error("Settings origin was not persisted");

		useSettingsStore.setState(useSettingsStore.getInitialState(), true);
		sessionStorage.setItem(storageKey, persisted);
		await useSettingsStore.persist.rehydrate();

		expect(useSettingsStore.getState().originRoute).toEqual(originRoute);
		expect(useSettingsStore.getState().isOpen).toBe(false);
		expect(useSettingsStore.getState().searchQuery).toBe("");
	});
});
