import { useBrowserOpenRequests } from "./hooks/use-browser-open-requests";
import { useGlobalBrowserLifecycle } from "./hooks/use-global-browser-lifecycle";

export function GlobalBrowserLifecycle() {
	useGlobalBrowserLifecycle();
	useBrowserOpenRequests();
	return null;
}
