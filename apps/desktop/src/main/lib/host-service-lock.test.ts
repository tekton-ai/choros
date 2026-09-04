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

let testRoot = "";
const isProcessAliveMock = mock((_pid: number) => true);

// Dynamic import is intentional: mocks must be installed before this module loads.
const realManifest = await import("./host-service-manifest");
mock.module("./host-service-manifest", () => ({
	...realManifest,
	isProcessAlive: isProcessAliveMock,
	manifestDir: () => testRoot,
}));
mock.module("@choros/shared/host-info", () => ({
	getHostId: () => "host-1",
	getHostName: () => "host",
}));
const { acquireSpawnLock, readSpawnLock } = await import("./host-service-lock");

const lockFile = () => path.join(testRoot, "spawn.lock");

describe("acquireSpawnLock", () => {
	beforeEach(() => {
		testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hsl-test-"));
		isProcessAliveMock.mockClear();
		isProcessAliveMock.mockImplementation(() => true);
	});
	afterEach(() => {
		if (testRoot) fs.rmSync(testRoot, { recursive: true, force: true });
		testRoot = "";
	});

	test("creates the singleton lock and records its owner", () => {
		const handle = acquireSpawnLock({ staleMs: 30_000 });
		expect(handle).not.toBeNull();
		expect(readSpawnLock()?.ownerPid).toBe(process.pid);
		expect(readSpawnLock()?.machineId).toBe("host-1");
		expect(fs.existsSync(lockFile())).toBe(true);
	});

	test("rejects a second live holder", () => {
		expect(acquireSpawnLock({ staleMs: 30_000 })).not.toBeNull();
		expect(acquireSpawnLock({ staleMs: 30_000 })).toBeNull();
	});

	test("release lets the next caller acquire", () => {
		const first = acquireSpawnLock({ staleMs: 30_000 });
		first?.release();
		expect(fs.existsSync(lockFile())).toBe(false);
		expect(acquireSpawnLock({ staleMs: 30_000 })).not.toBeNull();
	});

	test("steals a dead holder", () => {
		fs.writeFileSync(
			lockFile(),
			JSON.stringify({
				ownerPid: 424242,
				machineId: "host-1",
				acquiredAt: Date.now(),
			}),
		);
		isProcessAliveMock.mockImplementation(() => false);
		expect(acquireSpawnLock({ staleMs: 30_000 })).not.toBeNull();
		expect(readSpawnLock()?.ownerPid).toBe(process.pid);
	});

	test("steals a stale or malformed lock", () => {
		fs.writeFileSync(
			lockFile(),
			JSON.stringify({
				ownerPid: 424242,
				machineId: "host-1",
				acquiredAt: Date.now() - 60_000,
			}),
		);
		expect(acquireSpawnLock({ staleMs: 30_000 })).not.toBeNull();
		readSpawnLock();
		fs.rmSync(lockFile(), { force: true });
		fs.writeFileSync(lockFile(), "{ not valid json");
		expect(acquireSpawnLock({ staleMs: 30_000 })).not.toBeNull();
	});
});

afterAll(() => mock.restore());
