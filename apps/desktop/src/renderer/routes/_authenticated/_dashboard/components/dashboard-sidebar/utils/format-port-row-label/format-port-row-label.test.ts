import { describe, expect, it } from "bun:test";
import type { DashboardSidebarPort } from "../../hooks/use-dashboard-sidebar-ports-data";
import { formatPortRowLabel } from "./format-port-row-label";

const port: DashboardSidebarPort = {
	port: 3000,
	pid: 1,
	processName: "node",
	terminalId: "terminal-1",
	workspaceId: "workspace-1",
	detectedAt: 1,
	address: "127.0.0.1",
	label: null,
	hostId: "local",
	hostType: "local-device",
	hostUrl: "http://127.0.0.1:3001",
};

describe("formatPortRowLabel", () => {
	it("formats the loopback port", () => {
		expect(formatPortRowLabel(port)).toEqual({ text: "localhost:3000" });
	});
});
