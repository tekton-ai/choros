import { PortManager } from "@choros/port-scanner";
import { treeKillWithEscalation } from "./tree-kill.ts";

export const portManager = new PortManager({
	killFn: treeKillWithEscalation,
});
