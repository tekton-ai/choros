import { afterAll, afterEach, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useAutomationsExperimentStore } = await import(
	"./automations-experiment"
);
const { useSettingsOriginRoute, useSettingsStore } = await import(
	"./settings-state"
);
const originalEnabled = useAutomationsExperimentStore.getState().enabled;
const originalOrigin = useSettingsStore.getState().originRoute;
const originalStorage = localStorage.getItem("automations-experiment");

afterEach(() => {
	cleanup();
	useAutomationsExperimentStore.getState().setEnabled(originalEnabled);
	useSettingsStore.getState().setOriginRoute(originalOrigin);
	if (originalStorage === null)
		localStorage.removeItem("automations-experiment");
	else localStorage.setItem("automations-experiment", originalStorage);
});
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

test("disabling Automations gives Settings Back a reachable destination and preserves the original route", () => {
	useAutomationsExperimentStore.getState().setEnabled(true);
	useSettingsStore.getState().setOriginRoute("/automations/runs/example-run");
	const { result } = renderHook(useSettingsOriginRoute);
	expect(result.current).toBe("/automations/runs/example-run");
	act(() => useAutomationsExperimentStore.getState().setEnabled(false));
	expect(result.current).toBe("/v2-workspaces");
	act(() => useAutomationsExperimentStore.getState().setEnabled(true));
	expect(result.current).toBe("/automations/runs/example-run");
	act(() => {
		useAutomationsExperimentStore.getState().setEnabled(false);
		useSettingsStore.getState().setOriginRoute("/plugins");
	});
	expect(result.current).toBe("/plugins");
});
