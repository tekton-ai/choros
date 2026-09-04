import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";

let killedPids: Array<{ pid: number; signal: NodeJS.Signals | number }> = [];
let testManifestRoot = "";
const manifestStore: {
	current: {
		pid: number;
		endpoint: string;
		authToken: string;
		startedAt: number;
	} | null;
} = { current: null };
const readManifestMock = mock(() => manifestStore.current);
const removeManifestMock = mock(() => {
	manifestStore.current = null;
});
const isProcessAliveMock = mock(() => true);
const killProcessMock = mock((pid: number, signal: NodeJS.Signals | number) => {
	killedPids.push({ pid, signal });
});

// Dynamic imports are intentional: module mocks must be installed first.
const realManifest = await import("./host-service-manifest");
mock.module("./host-service-manifest", () => ({
	...realManifest,
	readManifest: readManifestMock,
	removeManifest: removeManifestMock,
	isProcessAlive: isProcessAliveMock,
	killProcess: killProcessMock,
	manifestDir: () => testManifestRoot,
}));
const pollHealthCheckMock = mock(() => Promise.resolve(true));
const realUtils = await import("./host-service-utils");
mock.module("./host-service-utils", () => ({
	...realUtils,
	HEALTH_POLL_TIMEOUT_MS: 10_000,
	MAX_HOST_LOG_BYTES: 1024,
	findFreePort: mock(() => Promise.resolve(40_000)),
	openRotatingLogFd: mock(() => -1),
	pollHealthCheck: pollHealthCheckMock,
}));
mock.module("electron", () => ({
	app: {
		getVersion: () => "1.2.3",
		isPackaged: false,
		getAppPath: () => "/tmp/app",
	},
	dialog: { showMessageBox: mock(async () => ({ response: 0 })) },
	webContents: { fromId: mock(() => null) },
	clipboard: { writeText: mock(() => {}), writeImage: mock(() => {}) },
	Menu: { buildFromTemplate: mock(() => ({ popup: mock(() => {}) })) },
}));
mock.module("electron-log/main", () => ({
	default: { info: () => {}, warn: () => {}, error: () => {} },
}));
mock.module("@choros/shared/host-info", () => ({
	getHostId: () => "host-1",
	getHostName: () => "host",
}));
mock.module("./local-db", () => ({
	localDb: { select: () => ({ from: () => ({ get: () => null }) }) },
}));

const { HostServiceCoordinator } = await import("./host-service-coordinator");

type Coordinator = InstanceType<typeof HostServiceCoordinator>;
type Instance = {
	pid: number;
	port: number;
	secret: string;
	status: "starting" | "running" | "stopped";
	spawnedAt: number;
	outputTail: string;
	redactions: string[];
	owned: boolean;
};

function runningInstance(overrides: Partial<Instance> = {}): Instance {
	return {
		pid: 1234,
		port: 40_000,
		secret: "secret",
		status: "running",
		spawnedAt: Date.now(),
		outputTail: "",
		redactions: ["secret"],
		owned: true,
		...overrides,
	};
}

function setInstance(
	coordinator: Coordinator,
	instance: Instance | null,
): void {
	(coordinator as unknown as { instance: Instance | null }).instance = instance;
}

function resetMocks(): void {
	manifestStore.current = null;
	killedPids = [];
	readManifestMock.mockClear();
	removeManifestMock.mockClear();
	isProcessAliveMock.mockClear();
	isProcessAliveMock.mockImplementation(() => true);
	killProcessMock.mockClear();
	pollHealthCheckMock.mockClear();
	pollHealthCheckMock.mockImplementation(() => Promise.resolve(true));
}

let coordinator: Coordinator;

beforeEach(() => {
	resetMocks();
	testManifestRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hsc-test-"));
	coordinator = new HostServiceCoordinator();
});

afterEach(() => {
	coordinator.stopAll();
	fs.rmSync(testManifestRoot, { recursive: true, force: true });
});

afterAll(() => mock.restore());

describe("HostServiceCoordinator singleton", () => {
	test("uses one stable port preference", () => {
		const internals = coordinator as unknown as {
			rememberPort(port: number): void;
			getPreferredPorts(): number[];
		};
		internals.rememberPort(46_666);
		expect(internals.getPreferredPorts()).toEqual([46_666, 48_000]);
	});

	test("uses one stable secret and seeds it from the manifest", () => {
		manifestStore.current = {
			pid: 55,
			endpoint: "http://127.0.0.1:40000",
			authToken: "manifest-secret",
			startedAt: 1,
		};
		const internals = coordinator as unknown as { getOrCreateSecret(): string };
		expect(internals.getOrCreateSecret()).toBe("manifest-secret");
		manifestStore.current = null;
		expect(internals.getOrCreateSecret()).toBe("manifest-secret");
	});

	test("returns only the singleton running connection", () => {
		setInstance(coordinator, runningInstance());
		expect(coordinator.getConnection()).toEqual({
			port: 40_000,
			secret: "secret",
			machineId: "host-1",
		});
		expect(coordinator.getConnections()).toHaveLength(1);
		expect(coordinator.getProcessStatus()).toBe("running");
	});

	test("coalesces concurrent starts", async () => {
		let resolveStart!: (value: {
			port: number;
			secret: string;
			machineId: string;
		}) => void;
		const startOrAdopt = mock(
			() =>
				new Promise<{ port: number; secret: string; machineId: string }>(
					(resolve) => {
						resolveStart = resolve;
					},
				),
		);
		(
			coordinator as unknown as { startOrAdopt: typeof startOrAdopt }
		).startOrAdopt = startOrAdopt;
		const first = coordinator.start();
		const second = coordinator.start();
		expect(startOrAdopt).toHaveBeenCalledTimes(1);
		resolveStart({ port: 40_000, secret: "secret", machineId: "host-1" });
		await expect(Promise.all([first, second])).resolves.toEqual([
			{ port: 40_000, secret: "secret", machineId: "host-1" },
			{ port: 40_000, secret: "secret", machineId: "host-1" },
		]);
	});

	test("stops an owned child and its held manifest", () => {
		setInstance(coordinator, runningInstance());
		manifestStore.current = {
			pid: 1234,
			endpoint: "http://127.0.0.1:40000",
			authToken: "secret",
			startedAt: 1,
		};
		coordinator.stop();
		expect(killedPids).toEqual([{ pid: 1234, signal: "SIGTERM" }]);
		expect(removeManifestMock).toHaveBeenCalledTimes(1);
		expect(coordinator.getConnection()).toBeNull();
	});

	test("does not kill an adopted child", () => {
		setInstance(coordinator, runningInstance({ owned: false }));
		coordinator.stop();
		expect(killedPids).toEqual([]);
	});

	test("status events have no organization identity", () => {
		const events: unknown[] = [];
		coordinator.on("status-changed", (event) => events.push(event));
		setInstance(coordinator, runningInstance());
		coordinator.stop();
		expect(events).toEqual([{ status: "stopped", previousStatus: "running" }]);
	});
});
