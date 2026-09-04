// Public package surface — host-service imports from "@choros/pty-daemon" or
// "@choros/pty-daemon/protocol". Daemon implementation runtime is Node;
// host-service is a CLIENT of the daemon (importing protocol types only),
// not a runtime peer.

import packageJson from "../package.json" with { type: "json" };

export { drainPendingKills } from "./pty/index.ts";
export { Server, type ServerOptions } from "./server/index.ts";
export type {
	HandoffSnapshot,
	SerializedSession,
	Session,
} from "./session-store/index.ts";
export {
	clearSnapshot,
	readSnapshot,
	writeSnapshot,
} from "./session-store/index.ts";

/**
 * Daemon binary version. Inlined from package.json by the bundler so
 * callers that can't readFileSync at runtime (apps/desktop, Electron)
 * still get the right value.
 */
export const DAEMON_PACKAGE_VERSION: string = packageJson.version;
