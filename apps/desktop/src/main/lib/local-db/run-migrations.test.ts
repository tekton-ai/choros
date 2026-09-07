import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations } from "./run-migrations";
import {
	openTestDatabase,
	readTestMigrations,
	testMigrationsFolder,
} from "./sqlite-test-database";

const migrations = readTestMigrations({
	migrationsFolder: testMigrationsFolder,
});
const profileIndex = migrations.findIndex((migration) =>
	migration.sql.some((sql) => sql.includes("CREATE TABLE `profiles`")),
);
const beforeProfiles = migrations.slice(0, profileIndex);

function structure(database: Database) {
	return database
		.prepare(
			"SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name",
		)
		.all();
}

function interruptedMigrations() {
	return migrations.map((migration, index) =>
		index !== profileIndex
			? migration
			: {
					...migration,
					sql: [
						...migration.sql.slice(0, 3),
						"SELECT * FROM injected_missing_table",
						...migration.sql.slice(3),
					],
				},
	);
}

describe("atomic local database migrations", () => {
	let directory: string;
	let database: Database;
	let path: string;
	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), "profile-migrations-"));
		path = join(directory, "local.db");
		database = openTestDatabase(path);
	});
	afterEach(() => {
		database.close();
		rmSync(directory, { recursive: true, force: true });
	});

	it("rolls back the journal and the full chain on an empty database, then retries and reopens", () => {
		const before = structure(database);
		expect(
			runMigrations(database, testMigrationsFolder, interruptedMigrations),
		).toEqual({ ok: false, code: "LOCAL_DB_MIGRATION_FAILED" });
		expect(structure(database)).toEqual(before);
		expect(
			runMigrations(database, testMigrationsFolder, readTestMigrations),
		).toEqual({ ok: true, applied: migrations.length });
		database.close();
		database = openTestDatabase(path);
		expect(
			runMigrations(database, testMigrationsFolder, readTestMigrations),
		).toEqual({ ok: true, applied: 0 });
		expect(
			database
				.prepare(
					"SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at",
				)
				.all(),
		).toEqual(
			migrations.map((migration) => ({
				hash: migration.hash,
				created_at: migration.folderMillis,
			})),
		);
	});

	it("preserves all existing structure, journal rows and settings when upgrade DDL fails", () => {
		expect(
			runMigrations(database, testMigrationsFolder, () => beforeProfiles),
		).toEqual({ ok: true, applied: beforeProfiles.length });
		database
			.prepare(
				"INSERT INTO settings (id, terminal_font_size, last_active_workspace_id) VALUES (1, 19, 'retained-legacy-value')",
			)
			.run();
		const before = structure(database);
		const journal = database
			.prepare("SELECT * FROM __drizzle_migrations ORDER BY created_at")
			.all();
		expect(
			runMigrations(database, testMigrationsFolder, interruptedMigrations).ok,
		).toBe(false);
		expect(structure(database)).toEqual(before);
		expect(
			database
				.prepare("SELECT * FROM __drizzle_migrations ORDER BY created_at")
				.all(),
		).toEqual(journal);
		expect(
			database
				.prepare(
					"SELECT terminal_font_size, last_active_workspace_id FROM settings WHERE id = 1",
				)
				.get(),
		).toEqual({
			terminal_font_size: 19,
			last_active_workspace_id: "retained-legacy-value",
		});
		expect(
			runMigrations(database, testMigrationsFolder, readTestMigrations),
		).toEqual({ ok: true, applied: migrations.length - beforeProfiles.length });
		database.close();
		database = openTestDatabase(path);
		for (const table of before.filter(
			(row) => (row as { type: string }).type === "table",
		)) {
			expect(
				database
					.prepare("SELECT sql FROM sqlite_master WHERE name = ?")
					.get((table as { name: string }).name),
			).toEqual({ sql: (table as { sql: string }).sql });
		}
		expect(
			database
				.prepare(
					"SELECT terminal_font_size, last_active_workspace_id FROM settings WHERE id = 1",
				)
				.get(),
		).toEqual({
			terminal_font_size: 19,
			last_active_workspace_id: "retained-legacy-value",
		});
	});

	it("rolls back the DDL if the migration journal cannot be updated", () => {
		expect(
			runMigrations(database, testMigrationsFolder, () => beforeProfiles).ok,
		).toBe(true);
		database.exec(
			"CREATE TRIGGER reject_journal BEFORE INSERT ON __drizzle_migrations BEGIN SELECT RAISE(ABORT, 'private database detail'); END;",
		);
		const before = structure(database);
		const journal = database
			.prepare("SELECT * FROM __drizzle_migrations ORDER BY created_at")
			.all();
		expect(
			runMigrations(database, testMigrationsFolder, readTestMigrations),
		).toEqual({ ok: false, code: "LOCAL_DB_MIGRATION_FAILED" });
		expect(structure(database)).toEqual(before);
		expect(
			database
				.prepare("SELECT * FROM __drizzle_migrations ORDER BY created_at")
				.all(),
		).toEqual(journal);
	});
});
