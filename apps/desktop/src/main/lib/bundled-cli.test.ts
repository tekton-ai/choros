import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	BUNDLED_CLI_SHIM_MARKER,
	buildBundledCliShim,
	getBundledCliBinaryName,
	getBundledCliShimName,
	installBundledCliShim,
} from "./bundled-cli";

describe("bundled CLI", () => {
	let tempDir: string;
	let binDir: string;
	let bundledCliPath: string;

	beforeEach(() => {
		tempDir = mkdtempSync(path.join(tmpdir(), "choros-bundled-cli-"));
		binDir = path.join(tempDir, "bin");
		bundledCliPath = path.join(tempDir, "resources", "bin", "choros");
		mkdirSync(path.dirname(bundledCliPath), { recursive: true });
		writeFileSync(bundledCliPath, "#!/bin/sh\n", { mode: 0o755 });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("uses the platform-specific binary and shim names", () => {
		expect(getBundledCliBinaryName("darwin")).toBe("choros");
		expect(getBundledCliShimName("darwin")).toBe("choros");
		expect(getBundledCliBinaryName("win32")).toBe("choros.exe");
		expect(getBundledCliShimName("win32")).toBe("choros.cmd");
	});

	it("builds a POSIX shim that execs the bundled binary safely", () => {
		const cliPath =
			"/Applications/Choros Test.app/Contents/Resources/bin/cho'ros";
		const shim = buildBundledCliShim(cliPath, "darwin");

		expect(shim).toContain(BUNDLED_CLI_SHIM_MARKER);
		expect(shim).toContain(
			`exec '/Applications/Choros Test.app/Contents/Resources/bin/cho'"'"'ros' "$@"`,
		);
	});

	it("installs an executable managed shim into the terminal bin directory", () => {
		const status = installBundledCliShim({
			binDir,
			bundledCliPath,
			platform: "darwin",
		});
		const shimPath = path.join(binDir, "choros");

		expect(status).toBe("installed");
		expect(existsSync(shimPath)).toBe(true);
		expect(readFileSync(shimPath, "utf-8")).toContain(BUNDLED_CLI_SHIM_MARKER);
		expect(statSync(shimPath).mode & 0o111).not.toBe(0);
	});

	it("updates an existing managed shim", () => {
		const shimPath = path.join(binDir, "choros");
		mkdirSync(binDir, { recursive: true });
		writeFileSync(shimPath, `${BUNDLED_CLI_SHIM_MARKER}\nold\n`, {
			mode: 0o755,
		});

		const status = installBundledCliShim({
			binDir,
			bundledCliPath,
			platform: "darwin",
		});

		expect(status).toBe("installed");
		expect(readFileSync(shimPath, "utf-8")).toContain(bundledCliPath);
	});

	it("does not overwrite an unmanaged choros executable", () => {
		const shimPath = path.join(binDir, "choros");
		mkdirSync(binDir, { recursive: true });
		writeFileSync(shimPath, "#!/bin/sh\necho custom\n", { mode: 0o755 });
		chmodSync(shimPath, 0o755);

		const status = installBundledCliShim({
			binDir,
			bundledCliPath,
			platform: "darwin",
		});

		expect(status).toBe("skipped");
		expect(readFileSync(shimPath, "utf-8")).toBe("#!/bin/sh\necho custom\n");
	});

	it("returns missing when the bundled binary is unavailable", () => {
		const status = installBundledCliShim({
			binDir,
			bundledCliPath: path.join(tempDir, "missing", "choros"),
			platform: "darwin",
		});

		expect(status).toBe("missing");
	});
});
