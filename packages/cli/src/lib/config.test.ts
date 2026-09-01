import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import * as nodeFs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Snapshot real fs functions BEFORE `mock.module` so test setup + assertions
// keep working even though `node:fs` is about to be replaced for the SUT.
const realFs = {
	chmodSync: nodeFs.chmodSync,
	existsSync: nodeFs.existsSync,
	mkdirSync: nodeFs.mkdirSync,
	mkdtempSync: nodeFs.mkdtempSync,
	readFileSync: nodeFs.readFileSync,
	renameSync: nodeFs.renameSync,
	rmSync: nodeFs.rmSync,
	statSync: nodeFs.statSync,
	unlinkSync: nodeFs.unlinkSync,
	writeFileSync: nodeFs.writeFileSync,
};

const originalChorosHomeDir = process.env.CHOROS_HOME_DIR;
const tempHome = realFs.mkdtempSync(join(tmpdir(), "choros-cli-config-"));
process.env.CHOROS_HOME_DIR = tempHome;

// Per-test mutable state for the mocked fs.
let renameShouldFail = false;
const writtenPaths: string[] = [];
const unlinkedPaths: string[] = [];

mock.module("node:fs", () => ({
	...nodeFs,
	writeFileSync: (
		path: nodeFs.PathOrFileDescriptor,
		data: string | NodeJS.ArrayBufferView,
		options?: nodeFs.WriteFileOptions,
	) => {
		writtenPaths.push(String(path));
		return realFs.writeFileSync(path, data, options);
	},
	renameSync: (oldPath: nodeFs.PathLike, newPath: nodeFs.PathLike) => {
		if (renameShouldFail) throw new Error("rename failed");
		return realFs.renameSync(oldPath, newPath);
	},
	unlinkSync: (path: nodeFs.PathLike) => {
		unlinkedPaths.push(String(path));
		return realFs.unlinkSync(path);
	},
}));

const { CHOROS_CONFIG_PATH, writeConfig } = await import("./config");

beforeEach(() => {
	writtenPaths.length = 0;
	unlinkedPaths.length = 0;
	renameShouldFail = false;
	if (realFs.existsSync(CHOROS_CONFIG_PATH)) {
		realFs.unlinkSync(CHOROS_CONFIG_PATH);
	}
});

afterAll(() => {
	realFs.rmSync(tempHome, { recursive: true, force: true });
	if (originalChorosHomeDir === undefined) {
		delete process.env.CHOROS_HOME_DIR;
	} else {
		process.env.CHOROS_HOME_DIR = originalChorosHomeDir;
	}
});

describe("config writes", () => {
	test("writeConfig uses unique temp files", () => {
		writeConfig({ apiKey: "sk_live_one" });
		writeConfig({ apiKey: "sk_live_two" });

		const tempWrites = writtenPaths.filter((p) => p.endsWith(".config.tmp"));
		expect(tempWrites).toHaveLength(2);
		expect(tempWrites[0]).not.toBe(tempWrites[1]);
		expect(
			JSON.parse(realFs.readFileSync(CHOROS_CONFIG_PATH, "utf-8")),
		).toEqual({
			apiKey: "sk_live_two",
		});
	});

	test("writeConfig preserves old config if rename fails", () => {
		realFs.writeFileSync(
			CHOROS_CONFIG_PATH,
			JSON.stringify({ apiKey: "sk_live_old" }),
		);

		renameShouldFail = true;

		expect(() => writeConfig({ apiKey: "sk_live_new" })).toThrow(
			/rename failed/,
		);

		expect(
			JSON.parse(realFs.readFileSync(CHOROS_CONFIG_PATH, "utf-8")),
		).toEqual({
			apiKey: "sk_live_old",
		});
		expect(unlinkedPaths).toHaveLength(1);
		expect(realFs.existsSync(unlinkedPaths[0] ?? "")).toBe(false);
	});

	test("writeConfig writes the exported Choros config path", () => {
		writeConfig({ organizationId: "org_123" });

		expect(
			JSON.parse(realFs.readFileSync(CHOROS_CONFIG_PATH, "utf-8")),
		).toEqual({
			organizationId: "org_123",
		});
	});
});
