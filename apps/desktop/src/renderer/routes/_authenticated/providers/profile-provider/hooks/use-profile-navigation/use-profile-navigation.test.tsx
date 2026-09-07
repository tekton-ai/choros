import { afterAll, afterEach, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, render } = await import("@testing-library/react");
const { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } =
	await import("@tanstack/react-router");
const React = await import("react");
const { persistentHistory } = await import(
	"renderer/lib/persistent-hash-history"
);
const { useProfileNavigation } = await import("./use-profile-navigation");
type Options = Parameters<typeof useProfileNavigation>[0];
type Navigation = ReturnType<typeof useProfileNavigation>;

const profiles = ["default", "a", "b"].map((id, sortOrder) => ({
	id,
	name: id,
	sortOrder,
	isDefault: id === "default",
	createdAt: 0,
	updatedAt: 0,
}));
const workspaces = ["a", "b"].map((owner) => ({
	id: `work-${owner}`,
	hostId: "local",
	projectId: `project-${owner}`,
	archivedAt: null,
	hostReachable: true,
	worktreeExists: true,
})) as Options["workspaces"];

function setup(getVisits: Options["getVisits"] = async () => []) {
	let navigation!: Navigation;
	let setEnabled!: (enabled: boolean) => void;
	let errors = 0;
	function Harness() {
		const [enabled, updateEnabled] = React.useState(true);
		const [activeProfileId, setActiveProfileId] = React.useState("a");
		setEnabled = updateEnabled;
		navigation = useProfileNavigation({
			enabled,
			isReady: true,
			activeProfileId: enabled ? activeProfileId : "default",
			profiles,
			defaultProfileId: "default",
			workspaces,
			workspacesReady: true,
			projects: [],
			projectsReady: true,
			failedWorkspaces: [],
			getFailedWorkspace: () => undefined,
			getProjectProfileId: (id) => (id === "project-a" ? "a" : "b"),
			getWorkspaceProfileId: (workspace) =>
				workspace.id === "work-a" ? "a" : "b",
			getVisits,
			activateProfile: setActiveProfileId,
			onNavigationError: () => {
				errors++;
			},
		});
		return (
			<>
				<input aria-label="draft" defaultValue="keep this draft" />
				<Outlet />
			</>
		);
	}
	persistentHistory.replace("/v2-workspace/work-a");
	const root = createRootRoute({ component: Harness });
	const workspace = createRoute({
		getParentRoute: () => root,
		path: "/v2-workspace/$workspaceId",
		component: () => <div>workspace</div>,
	});
	const list = createRoute({
		getParentRoute: () => root,
		path: "/v2-workspaces",
		component: () => <div>list</div>,
	});
	const router = createRouter({
		routeTree: root.addChildren([workspace, list]),
		history: persistentHistory,
	});
	return {
		router,
		mount: () => render(<RouterProvider router={router} />),
		get navigation() {
			return navigation;
		},
		setEnabled: (enabled: boolean) => setEnabled(enabled),
		get errors() {
			return errors;
		},
	};
}

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

test("disabling allows cross-profile history and notification focus without selecting its owner", async () => {
	const app = setup();
	await act(async () => {
		app.mount();
		await app.router.latestLoadPromise;
	});
	expect(app.navigation.isRouteVisible("/v2-workspace/work-b")).toBe(false);
	await act(async () => {
		app.setEnabled(false);
	});
	expect(app.navigation.isRouteVisible("/v2-workspace/work-b")).toBe(true);
	const source = { type: "terminal", id: "terminal-b" };
	let opened!: Promise<void>;
	await act(async () => {
		opened = app.navigation.openWorkspace("work-b", { source });
	});
	await act(async () => {
		await opened;
		await app.router.latestLoadPromise;
	});
	expect(app.router.state.location.pathname).toBe("/v2-workspace/work-b");
	expect(app.navigation.focusRequest?.source).toEqual(source);
	expect(
		app.navigation.isWorkspaceNavigationCurrent({
			id: "work-b",
			hostId: "local",
			projectId: "project-b",
		}),
	).toBe(true);
	expect(app.navigation.captureSubmission().profileId).toBe("default");
	await act(async () => {
		app.router.history.back();
		await app.router.latestLoadPromise;
	});
	expect(app.router.state.location.pathname).toBe("/v2-workspace/work-a");
	expect(app.errors).toBe(0);
});

test("disabling invalidates a pending restore and creation navigation while keeping the mounted draft", async () => {
	let finishVisits!: (
		visits: Awaited<ReturnType<Options["getVisits"]>>,
	) => void;
	const app = setup(
		() =>
			new Promise((resolve) => {
				finishVisits = resolve;
			}),
	);
	await act(async () => {
		app.mount();
		await app.router.latestLoadPromise;
	});
	const draft = document.querySelector<HTMLInputElement>("[aria-label=draft]");
	const submission = app.navigation.captureSubmission();
	await act(async () => {
		app.navigation.selectProfile("b");
	});
	await act(async () => {
		app.setEnabled(false);
	});
	await act(async () => {
		finishVisits([
			{ profileId: "b", workspaceId: "work-b", hostId: "local", visitedAt: 1 },
		]);
		await app.router.latestLoadPromise;
	});
	let lateNavigation = false;
	await act(async () => {
		await app.navigation.runSubmissionNavigation(submission, async () => {
			lateNavigation = true;
		});
	});
	expect(lateNavigation).toBe(false);
	expect(app.router.state.location.pathname).toBe("/v2-workspace/work-a");
	expect(document.querySelector("[aria-label=draft]")).toBe(draft);
	expect(draft?.value).toBe("keep this draft");
	expect(app.errors).toBe(0);
});
