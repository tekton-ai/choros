import { Database as BunDatabase } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import SuperJSON from "superjson";
import {
	type CreateAppOptions,
	type CreateAppResult,
	createApp,
} from "../../src/app";
import type { HostDb } from "../../src/db";
import * as schema from "../../src/db/schema";
import type { TokenSource } from "../../src/providers/git/local-git-credential-provider/credential-remedy";
import type { AppRouter as HostAppRouter } from "../../src/trpc/router";
import { FakeHostAuthProvider, MemoryGitCredentialProvider } from "./fakes";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");

export interface TestHostOptions {
	allowedOrigins?: string[];
	psk?: string;
	githubToken?: string | null;
	githubTokenSource?: TokenSource | null;
	/**
	 * Fake-runtime overrides typed as `unknown` so tests only need to
	 * implement the methods they exercise — the real surfaces (Octokit,
	 * ChatService) are far too large to stub fully.
	 */
	githubFactory?: () => Promise<unknown>;
	execGh?: (args: string[], options?: unknown) => Promise<unknown>;
	chatService?: unknown;
}

export interface TestHost {
	app: CreateAppResult["app"];
	eventBus: CreateAppResult["eventBus"];
	db: HostDb;
	dispose: () => Promise<void>;
	psk: string;
	dbPath: string;

	/** tRPC client that talks to the real Hono app via in-process fetch. */
	trpc: ReturnType<typeof createTRPCClient<HostAppRouter>>;
	/** tRPC client without the auth header — for testing 401 paths. */
	unauthenticatedTrpc: ReturnType<typeof createTRPCClient<HostAppRouter>>;
	/** Raw fetch into the app, useful for non-tRPC routes (CORS, websockets). */
	fetch: (input: Request | string, init?: RequestInit) => Promise<Response>;
}

/**
 * Boot the host-service `createApp` against an isolated `bun:sqlite` db with
 * fake providers, then return a tRPC client that round-trips through
 * `app.fetch` (no real network or port). Caller must `await dispose()`.
 *
 * `bun:sqlite` is used instead of `better-sqlite3` because Bun can't dlopen
 * the better-sqlite3 native binding (oven-sh/bun#4290). Both back the same
 * drizzle `BaseSQLiteDatabase` API; production still uses better-sqlite3 in
 * the bundled-Node host process.
 */
export async function createTestHost(
	options: TestHostOptions = {},
): Promise<TestHost> {
	const psk = options.psk ?? "test-psk-secret";
	const dataDir = mkdtempSync(join(tmpdir(), "host-service-test-db-"));
	const dbPath = join(dataDir, "host.db");

	// Isolate the daemon namespace for the lifetime of this host: any code
	// path that resolves manifests or sockets (reaper, adoption, dispose)
	// must land in this temp home, never `~/.choros` — a test host that
	// reads real manifests can reap or kill daemons belonging to running
	// desktop instances. The manifest layer throws in test runs without
	// this. Restored (not deleted) on dispose so nested harnesses keep
	// their own isolation.
	const priorHomeDir = process.env.CHOROS_HOME_DIR;
	if (!priorHomeDir) {
		process.env.CHOROS_HOME_DIR = dataDir;
	}

	const sqlite = new BunDatabase(dbPath, { create: true, readwrite: true });
	sqlite.exec("PRAGMA journal_mode = WAL");
	sqlite.exec("PRAGMA foreign_keys = ON");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

	const createOptions: CreateAppOptions = {
		config: {
			dbPath,
			migrationsFolder: MIGRATIONS_FOLDER,
			allowedOrigins: options.allowedOrigins ?? ["http://localhost:5173"],
		},
		providers: {
			hostAuth: new FakeHostAuthProvider(psk),
			credentials: new MemoryGitCredentialProvider(
				options.githubToken ?? null,
				options.githubTokenSource ?? null,
			),
		},
		db: db as unknown as HostDb,
		github: options.githubFactory
			? (options.githubFactory as CreateAppOptions["github"])
			: undefined,
		execGh: options.execGh
			? (options.execGh as CreateAppOptions["execGh"])
			: // Reject by default so unconfigured tests exercise the Octokit
				// fallback rather than shelling to a real `gh` on the host.
				async () => {
					throw new Error("execGh not configured in test");
				},
		chatService: options.chatService as CreateAppOptions["chatService"],
	};

	const result = createApp(createOptions);

	// Hono's `app.fetch(req, env, ctx)` second arg is the Cloudflare-style
	// env binding, NOT a `RequestInit`. Build a proper `Request` first and
	// pass it alone; otherwise tests that supply a pre-built `Request` plus
	// extra `init` would silently see the init ignored.
	const fetchApp = async (
		input: Request | string,
		init?: RequestInit,
	): Promise<Response> => {
		const request =
			typeof input === "string" ? new Request(input, init) : input;
		return result.app.fetch(request);
	};

	const buildClient = (authorized: boolean) =>
		createTRPCClient<HostAppRouter>({
			links: [
				httpBatchLink({
					url: "http://host-service.test/trpc",
					transformer: SuperJSON,
					fetch: async (url, init) => {
						return fetchApp(new Request(url as string, init as RequestInit));
					},
					headers: () => (authorized ? { authorization: `Bearer ${psk}` } : {}),
				}),
			],
		});

	const trpc = buildClient(true);
	const unauthenticatedTrpc = buildClient(false);

	const dispose = async (): Promise<void> => {
		// Run sqlite + temp-dir cleanup in a finally so a thrown
		// `result.dispose()` can't leak the bun:sqlite handle or leave
		// `host-service-test-db-*` directories behind for later runs.
		try {
			await result.dispose();
		} finally {
			if (!priorHomeDir && process.env.CHOROS_HOME_DIR === dataDir) {
				delete process.env.CHOROS_HOME_DIR;
			}
			try {
				sqlite.close();
			} catch {
				// best-effort
			}
			try {
				rmSync(dataDir, { recursive: true, force: true });
			} catch {
				// best-effort
			}
		}
	};

	return {
		app: result.app,
		eventBus: result.eventBus,
		db: db as unknown as HostDb,
		dispose,
		psk,
		dbPath,
		trpc,
		unauthenticatedTrpc,
		fetch: fetchApp,
	};
}
