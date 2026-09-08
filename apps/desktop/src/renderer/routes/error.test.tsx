import {
	afterAll,
	afterEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
const testGlobal = globalThis as typeof globalThis & {
	IS_REACT_ACT_ENVIRONMENT?: boolean;
};
const previousActEnvironment = testGlobal.IS_REACT_ACT_ENVIRONMENT;
testGlobal.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, screen } = await import(
	"@testing-library/react"
);
const {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} = await import("@tanstack/react-router");
const originalMacros = { ...(await import("@lingui/react/macro")) };
const { useLingui: useRealLingui } = await import("@lingui/react");

// The unit-test preload normally makes useLingui provider-independent. Use its
// real context check here so this regression cannot pass through that shim.
mock.module("@lingui/react/macro", () => ({
	...originalMacros,
	useLingui: () => {
		const context = useRealLingui();
		return { ...context, t: context.i18n._.bind(context.i18n) };
	},
}));
const { ErrorPage } = await import("./error");

afterEach(cleanup);
afterAll(async () => {
	mock.module("@lingui/react/macro", () => originalMacros);
	if (previousActEnvironment === undefined)
		delete testGlobal.IS_REACT_ACT_ENVIRONMENT;
	else testGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

describe("root route error fallback", () => {
	test("renders and reports the original error without RootLayout providers", async () => {
		const originalError = new Error("original route failure");
		const errorLog = spyOn(console, "error").mockImplementation(() => {});
		const rootRoute = createRootRoute({
			component: () => {
				throw originalError;
			},
			errorComponent: ErrorPage,
		});
		const indexRoute = createRoute({
			getParentRoute: () => rootRoute,
			path: "/",
			component: () => null,
		});
		const router = createRouter({
			routeTree: rootRoute.addChildren([indexRoute]),
			history: createMemoryHistory({ initialEntries: ["/"] }),
		});

		try {
			await act(async () => {
				render(<RouterProvider router={router} />);
				await router.latestLoadPromise;
			});
			expect(
				await screen.findByRole("heading", { name: "Something went wrong" }),
			).toBeTruthy();
			await act(async () => {
				fireEvent.click(screen.getByRole("button", { name: "Show details" }));
			});
			expect(document.querySelector("#error-details")?.textContent).toContain(
				originalError.message,
			);
			expect(
				errorLog.mock.calls.some(
					([label, error]) =>
						label === "[renderer] Route error caught:" &&
						error === originalError,
				),
			).toBe(true);
			expect(
				errorLog.mock.calls.some((args) =>
					args.some((value) => String(value).includes("without I18nProvider")),
				),
			).toBe(false);
		} finally {
			cleanup();
			errorLog.mockRestore();
		}
	});
});
