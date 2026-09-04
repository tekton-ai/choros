import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	listPtyDaemonManifests,
	ptyDaemonManifestDir,
	readPtyDaemonManifest,
	removePtyDaemonManifest,
	writePtyDaemonManifest,
} from "./manifest";

const originalHome = process.env.CHOROS_HOME_DIR;
const testHome = mkdtempSync(join(tmpdir(), "choros-daemon-manifest-"));
process.env.CHOROS_HOME_DIR = testHome;

beforeEach(() => removePtyDaemonManifest());
afterAll(() => {
	if (originalHome === undefined) delete process.env.CHOROS_HOME_DIR;
	else process.env.CHOROS_HOME_DIR = originalHome;
	rmSync(testHome, { recursive: true, force: true });
});

describe("singleton pty-daemon manifest", () => {
	test("round-trips the single daemon record", () => {
		const manifest = {
			pid: 1234,
			socketPath: "/tmp/choros-test.sock",
			protocolVersions: [1],
			startedAt: 1_700_000_000_000,
		};
		writePtyDaemonManifest(manifest);
		expect(readPtyDaemonManifest()).toEqual(manifest);
		expect(listPtyDaemonManifests()).toEqual([manifest]);
	});

	test("rejects malformed content", () => {
		writeFileSync(
			join(ptyDaemonManifestDir(), "pty-daemon-manifest.json"),
			"{}",
		);
		expect(readPtyDaemonManifest()).toBeNull();
	});

	test("removes the singleton manifest idempotently", () => {
		writePtyDaemonManifest({
			pid: 1234,
			socketPath: "/tmp/choros-test.sock",
			protocolVersions: [1],
			startedAt: Date.now(),
		});
		removePtyDaemonManifest();
		removePtyDaemonManifest();
		expect(readPtyDaemonManifest()).toBeNull();
		expect(listPtyDaemonManifests()).toEqual([]);
	});
});
