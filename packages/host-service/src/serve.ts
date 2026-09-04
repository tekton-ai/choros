import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { getSupervisor, startDaemonBootstrap } from "./daemon";
import { env } from "./env";
import { LocalGitCredentialProvider } from "./providers/git";
import { PskHostAuthProvider } from "./providers/host-auth";
import { provisionAgentIntegrations } from "./runtime/agent-provisioning";
import { resolveBrowserBridgeFromEnv } from "./runtime/browser-bridge/env";
import { applyLoginShellEnvToProcess } from "./runtime/login-shell-env";
import { installProcessSafetyNet, installUpgradeSocketGuard } from "./safety";
import { captureFatalStartupError, initSentry } from "./sentry";
import { startTerminalBaseEnvResolution } from "./terminal/env";
import { startTerminalReaper } from "./terminal/reaper";

async function main(): Promise<void> {
	initSentry();
	console.log(
		`[host-service] starting (port=${env.PORT}, NODE_ENV=${process.env.NODE_ENV ?? "unset"})`,
	);
	startTerminalBaseEnvResolution();
	void applyLoginShellEnvToProcess();
	startDaemonBootstrap();
	provisionAgentIntegrations();

	const { app, injectWebSocket, db } = createApp({
		config: {
			dbPath: env.HOST_DB_PATH,
			migrationsFolder: env.HOST_MIGRATIONS_FOLDER,
			allowedOrigins: env.CORS_ORIGINS ?? [],
			browserBridge: resolveBrowserBridgeFromEnv(env),
		},
		providers: {
			hostAuth: new PskHostAuthProvider(env.HOST_SERVICE_SECRET),
			credentials: new LocalGitCredentialProvider(),
		},
	});

	if (process.env.NODE_ENV === "development") {
		let shuttingDown = false;
		const devShutdown = async (signal: NodeJS.Signals) => {
			if (shuttingDown) return;
			shuttingDown = true;
			console.log(
				`[host-service] dev-mode ${signal} — stopping pty-daemon for clean iteration`,
			);
			try {
				await getSupervisor().stop();
			} catch (error) {
				console.error("[host-service] dev shutdown failed:", error);
			} finally {
				process.exit(0);
			}
		};
		process.on("SIGINT", () => void devShutdown("SIGINT"));
		process.on("SIGTERM", () => void devShutdown("SIGTERM"));
	}

	const server = serve(
		{ fetch: app.fetch, port: env.PORT, hostname: "127.0.0.1" },
		(info) => {
			installProcessSafetyNet();
			const address = info.address.includes(":")
				? `[${info.address}]`
				: info.address;
			console.log(`[host-service] listening on http://${address}:${info.port}`);
			startTerminalReaper(db);
		},
	);
	installUpgradeSocketGuard(server);
	injectWebSocket(server);
}

void main().catch(async (error) => {
	console.error("[host-service] Failed to start:", error);
	await captureFatalStartupError(error);
	process.exit(1);
});
