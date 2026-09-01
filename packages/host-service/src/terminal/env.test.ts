import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	buildV2TerminalEnv,
	getShellBootstrapEnv,
	getShellLaunchArgs,
	getTerminalBaseEnv,
	initTerminalBaseEnv,
	normalizeUtf8Locale,
	resetTerminalBaseEnvForTests,
	resolveLaunchShell,
	shellLaunchExpectsReadyMarker,
	stripTerminalRuntimeEnv,
} from "./env";

// ── resolveLaunchShell ───────────────────────────────────────────────

describe("resolveLaunchShell", () => {
	test("prefers the configured account shell over inherited SHELL", () => {
		expect(
			resolveLaunchShell(
				{ SHELL: "/bin/bash" },
				{ accountShell: "/opt/homebrew/bin/fish", platform: "darwin" },
			),
		).toBe("/opt/homebrew/bin/fish");
	});

	test("falls back to SHELL from base env when account shell is unavailable", () => {
		expect(
			resolveLaunchShell(
				{ SHELL: "/usr/local/bin/fish" },
				{ accountShell: null, platform: "darwin" },
			),
		).toBe("/usr/local/bin/fish");
	});

	test("falls back to /bin/sh when SHELL is absent", () => {
		expect(
			resolveLaunchShell({}, { accountShell: null, platform: "darwin" }),
		).toBe("/bin/sh");
	});

	test("does not default to /bin/zsh", () => {
		expect(
			resolveLaunchShell({}, { accountShell: null, platform: "darwin" }),
		).not.toBe("/bin/zsh");
	});
});

// ── normalizeUtf8Locale ──────────────────────────────────────────────

describe("normalizeUtf8Locale", () => {
	test("LC_ALL takes precedence over LANG (POSIX)", () => {
		expect(
			normalizeUtf8Locale({ LC_ALL: "fr_FR.UTF-8", LANG: "en_US.UTF-8" }),
		).toBe("fr_FR.UTF-8");
	});

	test("falls back to LANG when LC_ALL is absent", () => {
		expect(normalizeUtf8Locale({ LANG: "ja_JP.UTF-8" })).toBe("ja_JP.UTF-8");
	});

	test("matches case-insensitive utf8 variants", () => {
		expect(normalizeUtf8Locale({ LANG: "en_US.utf8" })).toBe("en_US.utf8");
		expect(normalizeUtf8Locale({ LC_ALL: "C.UTF8" })).toBe("C.UTF8");
	});

	test("defaults to en_US.UTF-8", () => {
		expect(normalizeUtf8Locale({})).toBe("en_US.UTF-8");
	});

	test("ignores non-UTF-8 locales", () => {
		expect(normalizeUtf8Locale({ LANG: "C", LC_ALL: "POSIX" })).toBe(
			"en_US.UTF-8",
		);
	});
});

// ── stripTerminalRuntimeEnv ──────────────────────────────────────────

describe("stripTerminalRuntimeEnv", () => {
	const secretsEnv: Record<string, string> = {
		// Host-service runtime keys that must not leak
		AUTH_TOKEN: "secret-token",
		CHOROS_AUTH_CONFIG_PATH: "/Users/test/.choros/config.json",
		HOST_SERVICE_SECRET: "secret",
		ORGANIZATION_ID: "org-123",
		HOST_CLIENT_ID: "device-abc",
		HOST_NAME: "My Mac",
		ELECTRON_RUN_AS_NODE: "1",
		HOST_DB_PATH: "/tmp/host.db",
		HOST_MANIFEST_DIR: "/tmp/manifests",
		HOST_MIGRATIONS_PATH: "/tmp/migrations",
		HOST_SERVICE_VERSION: "1.2.3",
		KEEP_ALIVE_AFTER_PARENT: "1",
		CHOROS_API_URL: "https://api.example.com",
		DESKTOP_VITE_PORT: "5173",
		// Node/app keys
		NODE_ENV: "development",
		NODE_OPTIONS: "--max-old-space-size=4096",
		NODE_PATH: "/some/path",
		// Dev-runner and Electron runtime vars
		npm_package_name: "choros",
		npm_config_registry: "https://registry.npmjs.org",
		npm_lifecycle_event: "dev",
		ELECTRON_ENABLE_LOGGING: "1",
		// Build-tool prefix keys
		VITE_API_URL: "http://localhost:3000",
		NEXT_PUBLIC_KEY: "pk_123",
		TURBO_TEAM: "my-team",
		// Legacy SUPERSET_* vars that should be stripped
		CHOROS_PANE_ID: "pane-1",
		CHOROS_TAB_ID: "tab-1",
		CHOROS_PORT: "51741",
		CHOROS_HOOK_VERSION: "2",
		CHOROS_WORKSPACE_NAME: "my-ws",
		// Auth refresh tokens inherited from parent (CLI/desktop) env
		OAUTH_REFRESH_TOKEN: "oauth-refresh-secret",
		CHOROS_REFRESH_TOKEN: "choros-refresh-secret",
		// Keys that SHOULD survive
		HOME: "/Users/test",
		PATH: "/usr/bin:/usr/local/bin",
		SHELL: "/bin/zsh",
		EDITOR: "vim",
		CHOROS_HOME_DIR: "/Users/test/.choros",
		CHOROS_AGENT_HOOK_PORT: "51741",
		CHOROS_AGENT_HOOK_VERSION: "2",
	};

	test("app/runtime secrets do not reach PTY env", () => {
		const result = stripTerminalRuntimeEnv(secretsEnv);
		expect(result.AUTH_TOKEN).toBeUndefined();
		expect(result.CHOROS_AUTH_CONFIG_PATH).toBeUndefined();
		expect(result.HOST_SERVICE_SECRET).toBeUndefined();
		expect(result.ORGANIZATION_ID).toBeUndefined();
		expect(result.HOST_CLIENT_ID).toBeUndefined();
		expect(result.ELECTRON_RUN_AS_NODE).toBeUndefined();
		expect(result.HOST_DB_PATH).toBeUndefined();
		expect(result.CHOROS_API_URL).toBeUndefined();
		expect(result.DESKTOP_VITE_PORT).toBeUndefined();
	});

	test("host-service control vars do not reach PTY env", () => {
		const result = stripTerminalRuntimeEnv(secretsEnv);
		expect(result.HOST_MANIFEST_DIR).toBeUndefined();
		expect(result.HOST_MIGRATIONS_PATH).toBeUndefined();
		expect(result.HOST_SERVICE_VERSION).toBeUndefined();
		expect(result.KEEP_ALIVE_AFTER_PARENT).toBeUndefined();
		expect(result.HOST_NAME).toBeUndefined();
	});

	test("Node/app keys are stripped", () => {
		const result = stripTerminalRuntimeEnv(secretsEnv);
		expect(result.NODE_ENV).toBeUndefined();
		expect(result.NODE_OPTIONS).toBeUndefined();
		expect(result.NODE_PATH).toBeUndefined();
	});

	test("dev-runner and Electron runtime vars do not reach PTY env", () => {
		const result = stripTerminalRuntimeEnv(secretsEnv);
		expect(result.npm_package_name).toBeUndefined();
		expect(result.npm_config_registry).toBeUndefined();
		expect(result.npm_lifecycle_event).toBeUndefined();
		expect(result.ELECTRON_ENABLE_LOGGING).toBeUndefined();
	});

	test("refresh tokens do not reach PTY env", () => {
		const result = stripTerminalRuntimeEnv(secretsEnv);
		expect(result.OAUTH_REFRESH_TOKEN).toBeUndefined();
		expect(result.CHOROS_REFRESH_TOKEN).toBeUndefined();
	});

	test("HOST_* prefix is stripped, DESKTOP_* exact keys only", () => {
		const env: Record<string, string> = {
			// HOST_* prefix: all stripped (including HOST_CLIENT_ID, HOST_NAME)
			HOST_DB_PATH: "/tmp/db",
			HOST_MANIFEST_DIR: "/tmp/manifests",
			HOST_SERVICE_SECRET: "secret",
			HOST_CLIENT_ID: "abc",
			HOST_NAME: "Mac",
			// DESKTOP_*: only our exact key stripped
			DESKTOP_VITE_PORT: "5173",
			// Legitimate Linux desktop vars: must survive
			DESKTOP_SESSION: "gnome",
			DESKTOP_STARTUP_ID: "startup-123",
			HOME: "/Users/test",
		};
		const result = stripTerminalRuntimeEnv(env);
		expect(result.HOST_DB_PATH).toBeUndefined();
		expect(result.HOST_MANIFEST_DIR).toBeUndefined();
		expect(result.HOST_SERVICE_SECRET).toBeUndefined();
		expect(result.DESKTOP_VITE_PORT).toBeUndefined();
		expect(result.HOST_CLIENT_ID).toBeUndefined();
		expect(result.HOST_NAME).toBeUndefined();
		// Linux desktop vars preserved
		expect(result.DESKTOP_SESSION).toBe("gnome");
		expect(result.DESKTOP_STARTUP_ID).toBe("startup-123");
		expect(result.HOME).toBe("/Users/test");
	});

	test("build-tool prefix keys are stripped", () => {
		const result = stripTerminalRuntimeEnv(secretsEnv);
		expect(result.VITE_API_URL).toBeUndefined();
		expect(result.NEXT_PUBLIC_KEY).toBeUndefined();
		expect(result.TURBO_TEAM).toBeUndefined();
	});

	test("removed legacy vars do not reach PTY env", () => {
		const result = stripTerminalRuntimeEnv(secretsEnv);
		expect(result.CHOROS_PANE_ID).toBeUndefined();
		expect(result.CHOROS_TAB_ID).toBeUndefined();
		expect(result.CHOROS_PORT).toBeUndefined();
		expect(result.CHOROS_HOOK_VERSION).toBeUndefined();
		expect(result.CHOROS_WORKSPACE_NAME).toBeUndefined();
	});

	test("user shell env vars survive stripping", () => {
		const result = stripTerminalRuntimeEnv(secretsEnv);
		expect(result.HOME).toBe("/Users/test");
		expect(result.PATH).toBe("/usr/bin:/usr/local/bin");
		expect(result.SHELL).toBe("/bin/zsh");
		expect(result.EDITOR).toBe("vim");
	});

	test("explicit Choros support keys are kept", () => {
		const result = stripTerminalRuntimeEnv(secretsEnv);
		expect(result.CHOROS_HOME_DIR).toBe("/Users/test/.choros");
		expect(result.CHOROS_AGENT_HOOK_PORT).toBe("51741");
		expect(result.CHOROS_AGENT_HOOK_VERSION).toBe("2");
	});

	test("shell-derived env preserves user tooling vars", () => {
		const shellEnv: Record<string, string> = {
			HOME: "/Users/dev",
			PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin",
			SHELL: "/bin/zsh",
			NVM_DIR: "/Users/dev/.nvm",
			PYENV_ROOT: "/Users/dev/.pyenv",
			GOPATH: "/Users/dev/go",
			SSH_AUTH_SOCK: "/tmp/ssh-agent.sock",
		};
		const result = stripTerminalRuntimeEnv(shellEnv);
		expect(result.NVM_DIR).toBe("/Users/dev/.nvm");
		expect(result.PYENV_ROOT).toBe("/Users/dev/.pyenv");
		expect(result.GOPATH).toBe("/Users/dev/go");
		expect(result.SSH_AUTH_SOCK).toBe("/tmp/ssh-agent.sock");
	});
});

// ── Shell launch behavior ────────────────────────────────────────────

describe("getShellLaunchArgs", () => {
	const chorosHomeDir = "/tmp/test-choros";

	test("zsh launches as login shell", () => {
		expect(getShellLaunchArgs({ shell: "/bin/zsh", chorosHomeDir })).toEqual([
			"-l",
		]);
	});

	test("bash falls back to login shell when rcfile missing", () => {
		const args = getShellLaunchArgs({ shell: "/bin/bash", chorosHomeDir });
		expect(args).toEqual(["-l"]);
	});

	test("fish uses init-command", () => {
		const args = getShellLaunchArgs({
			shell: "/usr/bin/fish",
			chorosHomeDir,
		});
		expect(args[0]).toBe("-l");
		expect(args[1]).toBe("--init-command");
		expect(args[2]).toContain("_choros_bin");
		expect(args[2]).toContain("133;A");
	});

	test("sh launches as login shell", () => {
		expect(getShellLaunchArgs({ shell: "/bin/sh", chorosHomeDir })).toEqual([
			"-l",
		]);
	});

	test("ksh launches as login shell", () => {
		expect(
			getShellLaunchArgs({ shell: "/usr/bin/ksh", chorosHomeDir }),
		).toEqual(["-l"]);
	});

	test("unsupported shells launch natively without bootstrap", () => {
		expect(
			getShellLaunchArgs({ shell: "/usr/bin/pwsh", chorosHomeDir }),
		).toEqual([]);
	});
});

describe("shellLaunchExpectsReadyMarker", () => {
	test("recognizes current zsh and bash wrappers", () => {
		const chorosHomeDir = mkdtempSync(
			path.join(tmpdir(), "choros-shell-ready-"),
		);
		try {
			mkdirSync(path.join(chorosHomeDir, "zsh"), { recursive: true });
			mkdirSync(path.join(chorosHomeDir, "bash"), { recursive: true });
			writeFileSync(path.join(chorosHomeDir, "zsh", ".zshrc"), "# rc\n");
			writeFileSync(
				path.join(chorosHomeDir, "zsh", ".zlogin"),
				'printf "\\033]133;A\\007"\n',
			);
			writeFileSync(
				path.join(chorosHomeDir, "bash", "rcfile"),
				'printf "\\033]133;A\\007"\n',
			);

			expect(
				shellLaunchExpectsReadyMarker({
					shell: "/bin/zsh",
					chorosHomeDir,
				}),
			).toBe(true);
			expect(
				shellLaunchExpectsReadyMarker({
					shell: "/bin/bash",
					chorosHomeDir,
				}),
			).toBe(true);
		} finally {
			rmSync(chorosHomeDir, { recursive: true, force: true });
		}
	});

	test("does not trust stale or incomplete wrapper files", () => {
		const chorosHomeDir = mkdtempSync(
			path.join(tmpdir(), "choros-shell-stale-"),
		);
		try {
			mkdirSync(path.join(chorosHomeDir, "zsh"), { recursive: true });
			mkdirSync(path.join(chorosHomeDir, "bash"), { recursive: true });
			writeFileSync(path.join(chorosHomeDir, "zsh", ".zshrc"), "# rc\n");
			writeFileSync(
				path.join(chorosHomeDir, "zsh", ".zlogin"),
				"# stale wrapper\n",
			);
			writeFileSync(
				path.join(chorosHomeDir, "bash", "rcfile"),
				"# stale wrapper\n",
			);

			expect(
				shellLaunchExpectsReadyMarker({
					shell: "/bin/zsh",
					chorosHomeDir,
				}),
			).toBe(false);
			expect(
				shellLaunchExpectsReadyMarker({
					shell: "/bin/bash",
					chorosHomeDir,
				}),
			).toBe(false);
		} finally {
			rmSync(chorosHomeDir, { recursive: true, force: true });
		}
	});

	test("recognizes fish's injected marker without wrapper files", () => {
		expect(
			shellLaunchExpectsReadyMarker({
				shell: "/usr/bin/fish",
				chorosHomeDir: "/tmp/missing-choros-home",
			}),
		).toBe(true);
	});
});

describe("getShellBootstrapEnv", () => {
	test("zsh bootstrap applies only when wrapper files exist", () => {
		const result = getShellBootstrapEnv({
			shell: "/bin/zsh",
			baseEnv: { HOME: "/Users/test" },
			chorosHomeDir: "/tmp/nonexistent-choros-dir",
		});
		expect(result).toEqual({});
	});

	test("bash returns no bootstrap env keys", () => {
		const result = getShellBootstrapEnv({
			shell: "/bin/bash",
			baseEnv: {},
			chorosHomeDir: "/tmp/test",
		});
		expect(result).toEqual({});
	});

	test("fish returns no bootstrap env keys", () => {
		const result = getShellBootstrapEnv({
			shell: "/usr/bin/fish",
			baseEnv: {},
			chorosHomeDir: "/tmp/test",
		});
		expect(result).toEqual({});
	});

	test("unsupported shells return no bootstrap env", () => {
		const result = getShellBootstrapEnv({
			shell: "/usr/bin/pwsh",
			baseEnv: {},
			chorosHomeDir: "/tmp/test",
		});
		expect(result).toEqual({});
	});
});

// ── Terminal base env preservation ───────────────────────────────────

describe("terminal base env preservation", () => {
	test("getTerminalBaseEnv throws when not initialized", () => {
		resetTerminalBaseEnvForTests();
		expect(() => getTerminalBaseEnv()).toThrow("not initialized");
	});

	test("PTY env is built from preserved snapshot, not live process.env", () => {
		resetTerminalBaseEnvForTests();

		// Simulate host-service startup: process.env = shellSnapshot + runtime keys
		const originalProcessEnv = { ...process.env };
		try {
			// Set up process.env as if desktop spawned host-service
			process.env.HOME = "/Users/test";
			process.env.PATH = "/usr/bin";
			process.env.SHELL = "/bin/zsh";
			process.env.NVM_DIR = "/Users/test/.nvm";
			// Runtime keys that should be stripped
			process.env.HOST_SERVICE_SECRET = "secret-123";
			process.env.ORGANIZATION_ID = "org-abc";
			process.env.ELECTRON_RUN_AS_NODE = "1";

			initTerminalBaseEnv();

			const baseEnv = getTerminalBaseEnv();

			// Shell vars preserved
			expect(baseEnv.HOME).toBe("/Users/test");
			expect(baseEnv.PATH).toBe("/usr/bin");
			expect(baseEnv.SHELL).toBe("/bin/zsh");
			expect(baseEnv.NVM_DIR).toBe("/Users/test/.nvm");

			// Runtime keys stripped
			expect(baseEnv.HOST_SERVICE_SECRET).toBeUndefined();
			expect(baseEnv.ORGANIZATION_ID).toBeUndefined();
			expect(baseEnv.ELECTRON_RUN_AS_NODE).toBeUndefined();

			// Modify process.env after init — preserved snapshot unaffected
			process.env.INJECTED_LATER = "should-not-appear";
			const freshBaseEnv = getTerminalBaseEnv();
			expect(freshBaseEnv.INJECTED_LATER).toBeUndefined();
		} finally {
			// Restore original process.env
			for (const key of Object.keys(process.env)) {
				if (!(key in originalProcessEnv)) {
					delete process.env[key];
				}
			}
			for (const [key, value] of Object.entries(originalProcessEnv)) {
				process.env[key] = value;
			}
			resetTerminalBaseEnvForTests();
		}
	});

	test("shell resolution failure means no terminal base env", () => {
		resetTerminalBaseEnvForTests();
		// Without calling initTerminalBaseEnv(), getTerminalBaseEnv throws
		expect(() => getTerminalBaseEnv()).toThrow();
	});
});

// ── buildV2TerminalEnv ───────────────────────────────────────────────

describe("buildV2TerminalEnv", () => {
	const baseParams = {
		baseEnv: {
			HOME: "/Users/test",
			PATH: "/usr/bin",
			SHELL: "/bin/zsh",
			CHOROS_HOME_DIR: "/Users/test/.choros",
		},
		shell: "/bin/zsh",
		chorosHomeDir: "/Users/test/.choros",
		organizationId: "org-1",
		cwd: "/tmp/workspace",
		terminalId: "term-1",
		workspaceId: "ws-1",
		workspacePath: "/tmp/workspace",
		rootPath: "/tmp/repo",
		chorosEnv: "production" as const,
		agentHookPort: "51741",
		agentHookVersion: "2",
	};

	test("injects the public terminal contract and retained v2 metadata", () => {
		const env = buildV2TerminalEnv(baseParams);
		expect(env).toMatchObject({
			TERM: "xterm-256color",
			TERM_PROGRAM: "kitty",
			TERM_PROGRAM_VERSION: "0.42.0",
			COLORTERM: "truecolor",
			PWD: "/tmp/workspace",
			CHOROS_TERMINAL_ID: "term-1",
			CHOROS_ORGANIZATION_ID: "org-1",
			CHOROS_WORKSPACE_ID: "ws-1",
			CHOROS_WORKSPACE_PATH: "/tmp/workspace",
			CHOROS_ROOT_PATH: "/tmp/repo",
			CHOROS_ENV: "production",
			CHOROS_AGENT_HOOK_PORT: "51741",
			CHOROS_AGENT_HOOK_VERSION: "2",
		});
		expect(env.TERM_PROGRAM).toBe("kitty");
		expect(env.SHELL).toBe("/bin/zsh");
		expect(env.LANG).toContain("UTF-8");
	});

	test("sets SHELL to the selected launch shell even when base env was stale", () => {
		const env = buildV2TerminalEnv({
			...baseParams,
			baseEnv: { ...baseParams.baseEnv, SHELL: "/bin/bash" },
			shell: "/opt/homebrew/bin/fish",
		});
		expect(env.SHELL).toBe("/opt/homebrew/bin/fish");
	});

	test("allows empty root path and alternate Choros env without breaking the contract", () => {
		const env = buildV2TerminalEnv({ ...baseParams, rootPath: "" });
		expect(env.CHOROS_ROOT_PATH).toBe("");

		const devEnv = buildV2TerminalEnv({
			...baseParams,
			rootPath: "",
			chorosEnv: "development",
		});
		expect(devEnv.CHOROS_ENV).toBe("development");
		expect(devEnv.CHOROS_ROOT_PATH).toBe("");
	});

	test("defaults COLORFGBG to dark mode", () => {
		const env = buildV2TerminalEnv(baseParams);
		expect(env.COLORFGBG).toBe("15;0");
	});

	test("sets COLORFGBG to light mode when themeType is light", () => {
		const env = buildV2TerminalEnv({
			...baseParams,
			themeType: "light",
		});
		expect(env.COLORFGBG).toBe("0;15");
	});

	test("defaults TERM_THEME to dark", () => {
		const env = buildV2TerminalEnv(baseParams);
		expect(env.TERM_THEME).toBe("dark");
	});

	test("sets TERM_THEME to dark when themeType is dark", () => {
		const env = buildV2TerminalEnv({
			...baseParams,
			themeType: "dark",
		});
		expect(env.TERM_THEME).toBe("dark");
	});

	test("sets TERM_THEME to light when themeType is light", () => {
		const env = buildV2TerminalEnv({
			...baseParams,
			themeType: "light",
		});
		expect(env.TERM_THEME).toBe("light");
	});

	test("drops removed v1 metadata while preserving user shell vars", () => {
		const env = buildV2TerminalEnv({
			...baseParams,
			baseEnv: {
				...baseParams.baseEnv,
				CHOROS_PANE_ID: "pane-1",
				CHOROS_TAB_ID: "tab-1",
				CHOROS_PORT: "51741",
				CHOROS_HOOK_VERSION: "2",
				CHOROS_WORKSPACE_NAME: "my-workspace",
				NVM_DIR: "/Users/test/.nvm",
				SSH_AUTH_SOCK: "/tmp/ssh.sock",
			},
		});
		expect(env.CHOROS_PANE_ID).toBeUndefined();
		expect(env.CHOROS_TAB_ID).toBeUndefined();
		expect(env.CHOROS_PORT).toBeUndefined();
		expect(env.CHOROS_HOOK_VERSION).toBeUndefined();
		expect(env.CHOROS_WORKSPACE_NAME).toBeUndefined();
		expect(env.NVM_DIR).toBe("/Users/test/.nvm");
		expect(env.SSH_AUTH_SOCK).toBe("/tmp/ssh.sock");
	});
});

// ── Integration: env never degenerates to process.env ────────────────

describe("v2 env contract boundary", () => {
	test("runtime secrets in base env are stripped even when present", () => {
		// Simulate a base env that somehow has runtime secrets
		// (e.g. from shell snapshot contamination)
		const env = buildV2TerminalEnv({
			baseEnv: {
				HOME: "/Users/test",
				PATH: "/usr/bin",
				SHELL: "/bin/zsh",
				HOST_SERVICE_SECRET: "top-secret",
				AUTH_TOKEN: "bearer-xyz",
				ORGANIZATION_ID: "org-abc",
				NODE_ENV: "production",
				VITE_SECRET: "vite-key",
				npm_package_name: "choros",
				ELECTRON_IS_DEV: "1",
			},
			shell: "/bin/zsh",
			chorosHomeDir: "/Users/test/.choros",
			organizationId: "org-abc",
			cwd: "/tmp/ws",
			terminalId: "t-1",
			workspaceId: "w-1",
			workspacePath: "/tmp/ws",
			rootPath: "",
			chorosEnv: "production",
			agentHookPort: "51741",
			agentHookVersion: "2",
		});

		// None of the runtime secrets should be present
		expect(env.HOST_SERVICE_SECRET).toBeUndefined();
		expect(env.AUTH_TOKEN).toBeUndefined();
		expect(env.ORGANIZATION_ID).toBeUndefined();
		expect(env.CHOROS_ORGANIZATION_ID).toBe("org-abc");
		expect(env.NODE_ENV).toBeUndefined();
		expect(env.VITE_SECRET).toBeUndefined();
		expect(env.npm_package_name).toBeUndefined();
		expect(env.ELECTRON_IS_DEV).toBeUndefined();

		// But user shell vars remain
		expect(env.HOME).toBe("/Users/test");
		expect(env.PATH).toBe("/usr/bin");
		expect(env.SHELL).toBe("/bin/zsh");
	});
});
