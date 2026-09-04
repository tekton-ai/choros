export type {
	AdoptOptions,
	Pty,
	PtyOnData,
	PtyOnExit,
	SpawnOptions,
} from "./pty.ts";
export { adoptFromFd, drainPendingKills, spawn } from "./pty.ts";
