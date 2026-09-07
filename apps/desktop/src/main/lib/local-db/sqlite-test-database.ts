import { Database } from "bun:sqlite";
import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";

export const testMigrationsFolder = fileURLToPath(
	new URL("../../../../../../packages/local-db/drizzle/", import.meta.url),
);

/**
 * Bun cannot load Electron's better-sqlite3 build and has no JS SQLite UDF API.
 * Execute the whole historical chain with SQL equivalents of the two bootstrap
 * UUID functions used by 0032. Native smoke must also run the untouched reader
 * with actual startup registration; these tests do not prove native ABI support.
 */
export function readTestMigrations(config: { migrationsFolder: string }) {
	return readMigrationFiles(config).map((migration) => ({
		...migration,
		sql: migration.sql.map((statement) =>
			statement
				.replaceAll(
					"uuid_v4()",
					"(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', (random() & 3) + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))))",
				)
				.replaceAll(
					"uuid_is_valid_v4(id)",
					"(length(id) = 36 AND id GLOB '????????-????-4???-[89abAB]???-????????????' AND replace(id, '-', '') NOT GLOB '*[^0-9a-fA-F]*')",
				),
		),
	}));
}

export function openTestDatabase(path: string): Database {
	const database = new Database(path);
	database.exec("PRAGMA foreign_keys = OFF; PRAGMA journal_mode = WAL;");
	return database;
}
