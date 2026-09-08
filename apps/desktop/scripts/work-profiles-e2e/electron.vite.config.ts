import { join } from "node:path";
import type { UserConfig } from "electron-vite";
import baseConfig from "../../electron.vite.config";

// Reuse the shipped entry points, aliases, macros and resource copying. Only
// the local test environment differs; profile/Host/terminal code is not mocked.
const config = baseConfig as UserConfig;
const rendererPort = process.env.PROFILE_E2E_RENDERER_PORT;
const notificationsPort = process.env.PROFILE_E2E_NOTIFICATIONS_PORT;
const workspaceName = process.env.PROFILE_E2E_WORKSPACE_NAME;
const appDir = process.env.PROFILE_E2E_APP_DIR;
if (!rendererPort || !notificationsPort || !workspaceName || !appDir) {
	throw new Error("Run this config through test:e2e:work-profiles");
}

for (const [target, section] of [
	["main", config.main],
	["preload", config.preload],
	["renderer", config.renderer],
] as const) {
	if (!section) continue;
	const outDir = join(appDir, "dist", target);
	section.build ??= {};
	section.build.outDir = outDir;
	section.build.rollupOptions ??= {};
	const output = section.build.rollupOptions.output;
	section.build.rollupOptions.output = Array.isArray(output)
		? output.map((entry) => ({ ...entry, dir: outDir }))
		: { ...output, dir: outDir };
	section.define = {
		...section.define,
		"process.env.NODE_ENV": JSON.stringify("development"),
		"process.env.SKIP_ENV_VALIDATION": JSON.stringify("1"),
		"process.env.DESKTOP_VITE_PORT": JSON.stringify(rendererPort),
		"process.env.DESKTOP_NOTIFICATIONS_PORT": JSON.stringify(notificationsPort),
		"process.env.CHOROS_WORKSPACE_NAME": JSON.stringify(workspaceName),
		"process.env.NEXT_PUBLIC_API_URL": JSON.stringify(
			`http://localhost:${rendererPort}`,
		),
		"process.env.SENTRY_DSN_DESKTOP": JSON.stringify(""),
		"process.env.SENTRY_DSN_HOST_SERVICE": JSON.stringify(""),
	};
	// No source-map uploads or production telemetry from an E2E build.
	if (section.build?.rollupOptions) {
		section.build.rollupOptions.plugins = [];
	}
}
if (config.renderer) {
	config.renderer.define = {
		...config.renderer.define,
		"import.meta.env.SENTRY_DSN_DESKTOP": JSON.stringify(""),
	};
}
export default config;
