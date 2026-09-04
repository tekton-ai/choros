export {
	DaemonSupervisor,
	type DaemonSupervisorOptions,
	listDaemonSessions,
	probeDaemonVersion,
} from "./daemon-supervisor.ts";
export { EXPECTED_DAEMON_VERSION } from "./expected-version.ts";
export {
	__resetSupervisorForTesting,
	getSupervisor,
	resolveSupervisorScriptPath,
	startDaemonBootstrap,
	waitForDaemonReady,
} from "./singleton.ts";
