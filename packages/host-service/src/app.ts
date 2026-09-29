import { ChatService } from "@choros/provider-auth/server";
import { createNodeWebSocket } from "@hono/node-ws";
import { trpcServer } from "@hono/trpc-server";
import { Octokit } from "@octokit/rest";
import { TRPCError } from "@trpc/server";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createChatV3Mount, registerChatV3Routes } from "./chat-v3";
import { createDb, type HostDb } from "./db";
import { EventBus, GitWatcher, registerEventBusRoute } from "./events";
import { registerForwardMuxRoute } from "./ports/forward-mux-route";
import { portManager } from "./ports/port-manager";
import type { HostAuthProvider } from "./providers/host-auth";
import { runArchivedWorkspaceReconcile } from "./runtime/archived-workspace-reconcile";
import {
	type AutomationRuntime,
	createAutomationRuntime,
} from "./runtime/automations";
import { registerBrowserCdpRoute } from "./runtime/browser-bridge/browser-cdp-route";
import { createNativeExecutionDriver } from "./runtime/executions/native-driver";
import {
	createExecutionPreparer,
	createPreparedExecutionRestorer,
	resolveAutomationDefinition,
} from "./runtime/executions/prepare-execution";
import type { AutomationRuntimeOptions } from "./runtime/executions/types";
import { WorkspaceFilesystemManager } from "./runtime/filesystem";
import type { GitCredentialProvider } from "./runtime/git";
import { createGitEnvResolver, createGitFactory } from "./runtime/git";
import { runMainWorkspaceSweep } from "./runtime/main-workspace-sweep";
import { runProjectBackfill } from "./runtime/project-backfill";
import { PullRequestRuntimeManager } from "./runtime/pull-requests";
import { registerWorkspaceTerminalRoute } from "./terminal/terminal";
import {
	SqliteTerminalAgentBindingPersistence,
	TerminalAgentStore,
} from "./terminal-agents";
import { appRouter } from "./trpc/router";
import { provisionSelectedAccounts } from "./trpc/router/usage/account-provisioning";
import {
	execGh as defaultExecGh,
	type ExecGh,
} from "./trpc/router/workspace-creation/utils/exec-gh";
import type { BrowserBridgeConfig, HostServiceContext } from "./types";
import { getHostWorkerPool } from "./workers/host-worker-pool";
import { gitWorkspaceRefsTask } from "./workers/tasks/git";

export interface CreateAppOptions {
	config: {
		dbPath: string;
		migrationsFolder: string;
		allowedOrigins: string[];
		/** Loopback surface for driving desktop browser panes; desktop-only. */
		browserBridge?: BrowserBridgeConfig;
	};
	providers: {
		hostAuth: HostAuthProvider;
		credentials: GitCredentialProvider;
	};
	/**
	 * Test-harness override hooks. Production never sets these — `createApp`
	 * builds each subsystem itself when omitted. `db` is overridden so tests
	 * can swap in `bun:sqlite` (better-sqlite3 isn't loadable under Bun;
	 * prod uses it on bundled Node). `github` and `chatService` are overridden
	 * to keep tests off the network and out of provider-auth storage.
	 */
	db?: HostDb;
	github?: () => Promise<Octokit>;
	execGh?: ExecGh;
	chatService?: ChatService;
	/** Constructor-only protocol fixtures; never exposed through host configuration or RPC. */
	automation?: Partial<
		Pick<
			AutomationRuntimeOptions,
			| "driver"
			| "prepareExecution"
			| "restorePreparedExecution"
			| "resolveDefinition"
			| "now"
		>
	> & { autoStart?: boolean };
}

export interface CreateAppResult {
	app: Hono;
	injectWebSocket: ReturnType<typeof createNodeWebSocket>["injectWebSocket"];
	db: HostDb;
	eventBus: EventBus;
	automations: AutomationRuntime;
	dispose: () => Promise<void>;
}

export function createApp(options: CreateAppOptions): CreateAppResult {
	const { config, providers } = options;

	const db = options.db ?? createDb(config.dbPath, config.migrationsFolder);
	const git = createGitFactory(providers.credentials);
	const github =
		options.github ??
		(async () => {
			const token = await providers.credentials.getToken("github.com");
			if (!token) {
				// Expected precondition failure (user has no GitHub auth), not an
				// internal error — every procedure calling ctx.github() inherits
				// this classification.
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: providers.credentials.credentialRemedy(
						"github.com",
						"missing",
					),
					cause: { kind: "NO_GITHUB_TOKEN" },
				});
			}
			return new Octokit({ auth: token });
		});
	const execGh: ExecGh = options.execGh ?? defaultExecGh;

	const filesystem = new WorkspaceFilesystemManager({ db });
	// GitWatcher is the single source of truth for `.git/` and worktree fs
	// activity per workspace. Both EventBus (broadcasts to clients) and the
	// pull-requests runtime (event-driven branch sync) subscribe to it.
	const gitWatcher = new GitWatcher(db, filesystem);
	gitWatcher.start();
	// Per-workspace branch/HEAD/upstream reads run in the worker pool: the
	// PR-sync loop fires them for every workspace on each watcher event and
	// 5-min sweep, which would otherwise spawn+drain git on the event loop.
	const resolveGitEnv = createGitEnvResolver(providers.credentials);
	const pullRequestRuntime = new PullRequestRuntimeManager({
		db,
		execGh,
		git,
		github,
		gitWatcher,
		readWorkspaceRefs: async (worktreePath) => {
			const gitEnv = await resolveGitEnv(worktreePath);
			return getHostWorkerPool().run(
				gitWorkspaceRefsTask,
				{ worktreePath, gitEnv },
				{
					timeoutMs: 15_000,
					strategy: "coalesce",
					dedupeKey: `${worktreePath}:workspace-refs`,
				},
			);
		},
	});
	pullRequestRuntime.start();
	// Provider auth (Anthropic / OpenAI OAuth + API keys) is per-machine, not
	// per-workspace. ChatService is a long-lived singleton wrapping the
	// provider auth storage; the `host.auth.*` router proxies to it.
	const chatService = options.chatService ?? new ChatService();

	// Native sessions stay lazy; a host with no chat or agent work need not open chat.db.
	let automationRuntime: AutomationRuntime;
	const chatV3 = createChatV3Mount({
		db,
		dbPath: config.dbPath,
		getAutomationClient: () => automationRuntime,
	});

	const app = new Hono();
	const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

	app.use(
		"*",
		cors({
			origin: config.allowedOrigins,
			allowHeaders: [
				"Content-Type",
				"Authorization",
				"trpc-accept",
				"x-choros-client-machine-id",
			],
		}),
	);

	const eventBus = new EventBus({ db, filesystem, gitWatcher });
	eventBus.start();
	// Post-construction wiring (pullRequestRuntime is built before the
	// EventBus): newly created workspaces get their first branch/upstream sync
	// + PR link immediately instead of waiting for the 5-min safety net.
	pullRequestRuntime.subscribeToWorkspaceEvents(eventBus);

	const terminalAgentPersistence = new SqliteTerminalAgentBindingPersistence(
		db,
	);
	// Hygiene only — reads hide defunct bindings via the session-liveness
	// join regardless, so a failure here must not block startup.
	try {
		terminalAgentPersistence.sweepDefunct();
	} catch (error) {
		console.warn(
			"[terminal-agents] failed to sweep defunct binding rows",
			error,
		);
	}
	const terminalAgentStore = new TerminalAgentStore(terminalAgentPersistence);

	const executionContext = (): HostServiceContext => ({
		git,
		credentials: providers.credentials,
		github,
		execGh,
		db,
		runtime,
		eventBus,
		terminalAgentStore,
		isAuthenticated: true,
		browserBridge: config.browserBridge,
	});
	automationRuntime = createAutomationRuntime({
		db,
		driver:
			options.automation?.driver ??
			createNativeExecutionDriver({ runtime: chatV3.runtime }),
		prepareExecution:
			options.automation?.prepareExecution ??
			createExecutionPreparer(executionContext),
		restorePreparedExecution:
			options.automation?.restorePreparedExecution ??
			createPreparedExecutionRestorer(executionContext),
		resolveDefinition:
			options.automation?.resolveDefinition ??
			(async (definition) =>
				resolveAutomationDefinition(executionContext(), definition)),
		now: options.automation?.now,
	});
	const runtime = {
		auth: chatService,
		filesystem,
		pullRequests: pullRequestRuntime,
		automations: automationRuntime,
	};
	let disposing = false;
	const automationStartup =
		options.automation?.autoStart !== false
			? automationRuntime.start().catch((error) => {
					console.error(
						"[host-service] automation startup reconciliation failed",
						error,
					);
				})
			: Promise.resolve();

	// Startup sweeps run in the background so they don't block server
	// startup. Ordering matters: the project backfill fills identity fields
	// on pre-existing rows before the main-workspace sweep touches them.
	//
	// None of them run in a sandbox. Every one repairs state a long-lived
	// machine accumulates — rows that predate a column, a delete a previous
	// process crashed out of — and a sandbox is provisioned fresh with exactly
	// one project and one workspace, seeded by us, that no earlier build ever
	// touched. There is nothing to recover, so the sweeps can only invent:
	// the main-workspace sweep already added a phantom second workspace here
	// before bootstrap started seeding `type='main'`.
	const startupReconcile = (async () => {
		if (disposing || process.env.CHOROS_HOST_RUN_MODE === "sandbox") return;
		await runProjectBackfill({
			db,
			eventBus,
		}).catch((err) => {
			console.warn("[host-service] project backfill failed:", err);
		});
		if (disposing) return;
		// Backfill `kind='main'` workspaces for projects already set up before
		// this column shipped. Idempotent — only does real work the first
		// time after upgrade.
		await runMainWorkspaceSweep({
			db,
			git,
			eventBus,
		}).catch((err) => {
			console.warn("[host-service] main-workspace sweep failed:", err);
		});
		if (disposing) return;
		// Finish any delete the previous process crashed out of (archived row
		// whose worktree still exists).
		await runArchivedWorkspaceReconcile({
			git,
			credentials: providers.credentials,
			github,
			execGh,
			db,
			runtime,
			eventBus,
			terminalAgentStore,
			isAuthenticated: true,
		}).catch((err) => {
			console.warn("[host-service] archived-workspace reconcile failed:", err);
		});
		if (disposing) return;
		// Re-share the default account's Claude/Codex config into the selected
		// provider profiles. Last: it touches no host state the sweeps above
		// repair, and a slow filesystem must not delay them.
		await provisionSelectedAccounts(db).catch((err) => {
			console.warn("[host-service] account provisioning failed:", err);
		});
	})();

	const wsAuth: MiddlewareHandler = async (c, next) => {
		const token = c.req.query("token");
		const authorized =
			(await providers.hostAuth.validate(c.req.raw)) ||
			(token && (await providers.hostAuth.validateToken(token)));
		if (!authorized) return c.json({ error: "Unauthorized" }, 401);
		return next();
	};
	app.use("/terminal/*", wsAuth);
	app.use("/events", wsAuth);
	app.use("/chat-v3/*", wsAuth);
	app.use("/browser/*", wsAuth);
	app.use("/fwd", wsAuth);

	registerEventBusRoute({ app, eventBus, upgradeWebSocket });
	registerBrowserCdpRoute({
		app,
		upgradeWebSocket,
		getBridge: () => config.browserBridge,
	});
	registerForwardMuxRoute({
		app,
		upgradeWebSocket,
		getPortsByWorkspace: (workspaceId) =>
			portManager.getPortsByWorkspace(workspaceId),
	});
	registerWorkspaceTerminalRoute({
		app,
		db,
		eventBus,
		upgradeWebSocket,
	});
	registerChatV3Routes({ app, db, mount: chatV3, upgradeWebSocket });

	app.use(
		"/trpc/*",
		trpcServer({
			router: appRouter,
			// Renderer clients send every request (including queries) as POST —
			// see WorkspaceClientProvider/host-service-client's methodOverride —
			// so a query with a large input (e.g. git.getDiffBulk's file-path
			// list, or a same-tick batch across many workspaces) doesn't produce
			// a GET URL long enough to blow past the header-size limit. Without
			// this flag trpc's default HTTP-method map rejects those POSTs with
			// METHOD_NOT_SUPPORTED before the query ever runs.
			allowMethodOverride: true,
			createContext: async (_opts, c) => {
				const isAuthenticated = await providers.hostAuth.validate(c.req.raw);
				return {
					git,
					credentials: providers.credentials,
					github,
					execGh,
					db,
					runtime,
					eventBus,
					terminalAgentStore,
					isAuthenticated,
					clientMachineId:
						c.req.header("x-choros-client-machine-id") ?? undefined,
					browserBridge: config.browserBridge,
				} as Record<string, unknown>;
			},
		}),
	);

	const ownsDb = options.db === undefined;
	const dispose = async (): Promise<void> => {
		disposing = true;
		await Promise.allSettled([automationStartup, startupReconcile]);
		// Each step is best-effort and isolated: a throw in one cleanup must
		// not skip the others, otherwise a flaky `.stop()` could leak the
		// open SQLite handle for the rest of the process lifetime.
		try {
			pullRequestRuntime.stop();
		} catch (err) {
			console.warn("[host-service] pullRequestRuntime.stop failed:", err);
		}
		try {
			await automationRuntime.stop();
		} catch (err) {
			console.warn("[host-service] automation runtime stop failed:", err);
		}
		try {
			await chatV3.dispose();
		} catch (err) {
			console.warn("[host-service] chatV3.dispose failed:", err);
		}
		try {
			eventBus.close();
		} catch (err) {
			console.warn("[host-service] eventBus.close failed:", err);
		}
		try {
			gitWatcher.close();
		} catch (err) {
			console.warn("[host-service] gitWatcher.close failed:", err);
		}
		if (ownsDb) {
			try {
				(db as unknown as { $client?: { close: () => void } }).$client?.close();
			} catch {
				// best-effort close; tests should not fail on teardown
			}
		}
	};

	return {
		app,
		injectWebSocket,
		db,
		eventBus,
		automations: automationRuntime,
		dispose,
	};
}
