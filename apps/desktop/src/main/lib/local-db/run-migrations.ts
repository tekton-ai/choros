import { type MigrationMeta, readMigrationFiles } from "drizzle-orm/migrator";
import type { SyncSqlite } from "./sync-sqlite";

export type MigrationResult =
	| { ok: true; applied: number }
	| { ok: false; code: "LOCAL_DB_MIGRATION_FAILED" };

/**
 * Keep Drizzle's reader, hashes, timestamps and journal schema. Unlike its sync
 * dialect, journal creation also belongs to the same transaction as the DDL.
 * Metadata injection lets fault tests execute the real migration chain.
 */
export function runMigrations(
	database: SyncSqlite,
	migrationsFolder: string,
	readMigrations: (config: {
		migrationsFolder: string;
	}) => MigrationMeta[] = readMigrationFiles,
): MigrationResult {
	try {
		const migrations = readMigrations({ migrationsFolder });
		const applied = database.transaction(() => {
			database.exec(
				"CREATE TABLE IF NOT EXISTS __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)",
			);
			const last = database
				.prepare(
					"SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1",
				)
				.get() as { created_at: number | null } | undefined;
			const insert = database.prepare(
				"INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
			);
			let count = 0;
			for (const migration of migrations) {
				if (last && Number(last.created_at) >= migration.folderMillis) continue;
				for (const statement of migration.sql) database.exec(statement);
				insert.run(migration.hash, migration.folderMillis);
				count++;
			}
			return count;
		})();
		return { ok: true, applied };
	} catch {
		// Driver errors can contain SQL/user data. Report a stable code only.
		return { ok: false, code: "LOCAL_DB_MIGRATION_FAILED" };
	}
}
