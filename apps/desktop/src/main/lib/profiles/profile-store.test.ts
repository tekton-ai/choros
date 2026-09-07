import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	DEFAULT_PROFILE_ID,
	type ProfileChange,
	type ProfileMemberRef,
	type ProfileRegistry,
	type ProfileSnapshot,
} from "shared/profiles";
import { runMigrations } from "../local-db/run-migrations";
import {
	openTestDatabase,
	readTestMigrations,
	testMigrationsFolder,
} from "../local-db/sqlite-test-database";
import {
	type ProfileErrorCode,
	ProfileStore,
	ProfileStoreError,
} from "./profile-store";

const profileMigrations = readTestMigrations({
	migrationsFolder: testMigrationsFolder,
}).filter((migration) =>
	migration.sql.some((sql) => sql.includes("CREATE TABLE `profiles`")),
);
const project: ProfileMemberRef = {
	kind: "project",
	projectKey: "offline-project",
};
const session: ProfileMemberRef = {
	kind: "session",
	hostId: "local",
	workspaceId: "offline-session",
};

function registry(store: ProfileStore): ProfileRegistry {
	const result = store.get();
	if (!result.available) throw new Error("Registry unavailable in test");
	return result.registry;
}

function expectCode(operation: () => unknown, code: ProfileErrorCode) {
	try {
		operation();
		throw new Error("Expected profile operation to fail");
	} catch (error) {
		expect(error).toBeInstanceOf(ProfileStoreError);
		expect((error as ProfileStoreError).code).toBe(code);
		expect((error as Error).message).toBe(code);
	}
}

describe("ProfileStore with real SQLite", () => {
	let directory: string;
	let database: Database;
	let store: ProfileStore;
	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), "profile-store-"));
		database = openTestDatabase(join(directory, "local.db"));
		expect(
			runMigrations(database, testMigrationsFolder, () => profileMigrations).ok,
		).toBe(true);
		store = new ProfileStore(database);
	});
	afterEach(() => {
		database.close();
		rmSync(directory, { recursive: true, force: true });
	});

	it("lazily creates one Default without backfilling members, then survives reopen", () => {
		expect(database.prepare("SELECT * FROM profiles").all()).toEqual([]);
		const initial = registry(store);
		expect(
			initial.profiles.map((profile) => [profile.id, profile.isDefault]),
		).toEqual([[DEFAULT_PROFILE_ID, true]]);
		expect(initial.memberships).toEqual([]);
		const work = store.create({ name: "Work" });
		store.move({ profileId: work.id, members: [project, session] });
		store.select({ profileId: work.id });
		store.visit({
			profileId: work.id,
			hostId: "local",
			workspaceId: "offline-session",
			visitedAt: 50,
		});
		const snapshot = store.serializeSnapshot();
		database.close();
		database = openTestDatabase(join(directory, "local.db"));
		store = new ProfileStore(database);
		expect(store.serializeSnapshot()).toEqual(snapshot);
		expect(registry(store).selectedProfileId).toBe(work.id);
	});

	it("normalizes Unicode names without changing display spelling and counts code points", () => {
		const profile = store.create({ name: "  Cafe\u0301  " });
		expect(profile.name).toBe("Cafe\u0301");
		expectCode(() => store.create({ name: "CAFÉ" }), "PROFILE_NAME_CONFLICT");
		store.create({ name: "Работа" });
		expectCode(
			() => store.rename({ profileId: profile.id, name: "РАБОТА" }),
			"PROFILE_NAME_CONFLICT",
		);
		expect(store.create({ name: "𠮷".repeat(80) }).name).toBe("𠮷".repeat(80));
		expectCode(
			() => store.create({ name: "𠮷".repeat(81) }),
			"PROFILE_INVALID_INPUT",
		);
		expectCode(() => store.create({ name: " \n\t " }), "PROFILE_INVALID_INPUT");
	});

	it("rejects Unicode caseless duplicates in creation, rename and snapshot replacement", () => {
		const greek = store.create({ name: "Σ" });
		expectCode(() => store.create({ name: "ς" }), "PROFILE_NAME_CONFLICT");
		const german = store.create({ name: "Straße" });
		expectCode(
			() => store.rename({ profileId: greek.id, name: "STRASSE" }),
			"PROFILE_NAME_CONFLICT",
		);
		const before = store.serializeSnapshot();
		expectCode(
			() =>
				store.applySnapshot({
					...before,
					profiles: before.profiles.map((profile) =>
						profile.id === german.id ? { ...profile, name: "ς" } : profile,
					),
				}),
			"PROFILE_INVALID_SNAPSHOT",
		);
		expect(store.serializeSnapshot()).toEqual(before);
	});

	it("preserves Default identity when renamed/reordered and validates complete ordering", () => {
		const work = store.create({ name: "Work" });
		store.rename({ profileId: DEFAULT_PROFILE_ID, name: "Everything else" });
		store.reorder({ profileIds: [work.id, DEFAULT_PROFILE_ID] });
		expect(registry(store).profiles.map((profile) => profile.id)).toEqual([
			work.id,
			DEFAULT_PROFILE_ID,
		]);
		const before = store.serializeSnapshot();
		expectCode(
			() => store.reorder({ profileIds: [work.id, work.id] }),
			"PROFILE_INVALID_INPUT",
		);
		expectCode(
			() => store.reorder({ profileIds: [work.id] }),
			"PROFILE_INVALID_INPUT",
		);
		expectCode(
			() =>
				store.delete({
					profileId: DEFAULT_PROFILE_ID,
					confirmed: true,
					moveToDefault: true,
				}),
			"PROFILE_DEFAULT_REQUIRED",
		);
		expectCode(
			() =>
				store.delete({
					profileId: work.id,
					confirmed: false,
					moveToDefault: false,
				}),
			"PROFILE_CONFIRMATION_REQUIRED",
		);
		expect(store.serializeSnapshot()).toEqual(before);
	});

	it("keeps typed project/session identities and composite session hosts distinct", () => {
		const work = store.create({ name: "Work" });
		const members: ProfileMemberRef[] = [
			{ kind: "project", projectKey: "same" },
			{ kind: "session", hostId: "one", workspaceId: "same" },
			{ kind: "session", hostId: "two", workspaceId: "same" },
		];
		store.move({ profileId: work.id, members });
		expect(registry(store).memberships).toEqual(
			members.map((member) => ({ profileId: work.id, member })),
		);
		store.move({
			profileId: DEFAULT_PROFILE_ID,
			members: [members[1] as ProfileMemberRef],
		});
		expect(registry(store).memberships).toEqual(
			[members[0], members[2]].map((member) => ({
				profileId: work.id,
				member,
			})),
		);
		expect(
			database
				.prepare("SELECT * FROM profile_memberships WHERE profile_id = ?")
				.all(DEFAULT_PROFILE_ID),
		).toEqual([]);
		const before = store.serializeSnapshot();
		expectCode(
			() =>
				store.move({
					profileId: work.id,
					members: [
						{
							kind: "session",
							hostId: "one",
							workspaceId: "same",
							projectKey: "illegal",
						} as ProfileMemberRef,
					],
				}),
			"PROFILE_INVALID_INPUT",
		);
		expectCode(
			() => store.move({ profileId: "missing", members: [project] }),
			"PROFILE_NOT_FOUND",
		);
		expectCode(
			() => store.move({ profileId: work.id, members: [project, project] }),
			"PROFILE_INVALID_INPUT",
		);
		expect(store.serializeSnapshot()).toEqual(before);
	});

	it("rolls back a partially executed batch move and emits nothing before commit", () => {
		const work = store.create({ name: "Work" });
		const before = registry(store);
		const events: ProfileChange[] = [];
		const transactionStates: boolean[] = [];
		store.subscribe((event) => {
			transactionStates.push(database.inTransaction);
			events.push(event);
		});
		database.exec(
			"CREATE TRIGGER reject_second_member BEFORE INSERT ON profile_memberships WHEN NEW.kind = 'session' BEGIN SELECT RAISE(ABORT, 'private object detail'); END;",
		);
		expectCode(
			() => store.move({ profileId: work.id, members: [project, session] }),
			"PROFILE_UNAVAILABLE",
		);
		expect(registry(store)).toEqual(before);
		expect(events).toEqual([]);
		database.exec("DROP TRIGGER reject_second_member");
		store.move({ profileId: work.id, members: [project, session] });
		expect(events).toEqual([
			{ revision: before.revision + 1, kind: "registry" },
		]);
		expect(transactionStates).toEqual([false]);
		const stop = store.subscribe(() => {
			throw new Error("closed renderer");
		});
		store.select({ profileId: work.id });
		stop();
		expect(registry(store).selectedProfileId).toBe(work.id);
	});

	it("uses persisted offline members for nonempty deletion and atomically clears references", () => {
		const work = store.create({ name: "Work" });
		store.move({ profileId: work.id, members: [project, session] });
		store.select({ profileId: work.id });
		store.visit({
			profileId: work.id,
			hostId: "local",
			workspaceId: "offline-session",
			visitedAt: 50,
		});
		expectCode(
			() =>
				store.delete({
					profileId: work.id,
					confirmed: true,
					moveToDefault: false,
				}),
			"PROFILE_NOT_EMPTY",
		);
		const before = store.serializeSnapshot();
		database.exec(
			"CREATE TRIGGER reject_profile_delete BEFORE DELETE ON profiles BEGIN SELECT RAISE(ABORT, 'private profile detail'); END;",
		);
		expectCode(
			() =>
				store.delete({
					profileId: work.id,
					confirmed: true,
					moveToDefault: true,
				}),
			"PROFILE_UNAVAILABLE",
		);
		expect(store.serializeSnapshot()).toEqual(before);
		database.exec("DROP TRIGGER reject_profile_delete");
		store.delete({ profileId: work.id, confirmed: true, moveToDefault: true });
		expect(registry(store).memberships).toEqual([]);
		expect(registry(store).selectedProfileId).toBe(DEFAULT_PROFILE_ID);
		expect(store.serializeSnapshot().visits).toEqual([]);
		expectCode(() => store.select({ profileId: work.id }), "PROFILE_NOT_FOUND");
	});

	it("upserts visits by profile/host/workspace and ignores late older observations", () => {
		registry(store);
		const visit = {
			profileId: DEFAULT_PROFILE_ID,
			hostId: "one",
			workspaceId: "same",
			visitedAt: 20,
		};
		store.visit(visit);
		store.visit({ ...visit, hostId: "two", visitedAt: 25 });
		store.visit({ ...visit, visitedAt: 30 });
		const revision = registry(store).revision;
		store.visit({ ...visit, visitedAt: 10 });
		expect(registry(store).revision).toBe(revision);
		expect(store.visits({ profileId: DEFAULT_PROFILE_ID })).toEqual([
			{ ...visit, visitedAt: 30 },
			{ ...visit, hostId: "two", visitedAt: 25 },
		]);
		expectCode(
			() => store.visit({ ...visit, profileId: "missing" }),
			"PROFILE_NOT_FOUND",
		);
	});

	it("reports unavailable tables without erasing old state and recovers by rereading", () => {
		const work = store.create({ name: "Work" });
		store.move({ profileId: work.id, members: [project] });
		const before = registry(store);
		database.exec(
			"CREATE TEMP VIEW profile_workspace_visits AS SELECT * FROM unavailable_visits_source",
		);
		expect(store.get()).toEqual({ available: false, reason: "unavailable" });
		expectCode(
			() => store.create({ name: "Not created" }),
			"PROFILE_UNAVAILABLE",
		);
		database.exec("DROP VIEW temp.profile_workspace_visits");
		expect(registry(store)).toEqual(before);
		database.exec("DELETE FROM profile_registry_state");
		expect(store.get()).toEqual({ available: false, reason: "unavailable" });
		expect(
			database.prepare("SELECT * FROM profile_registry_state").all(),
		).toEqual([]);
		expect(
			database.prepare("SELECT name FROM profiles WHERE id = ?").get(work.id),
		).toEqual({ name: "Work" });
	});

	it("resolves dangling ownership and selection to Default without deleting persisted members", () => {
		registry(store);
		database
			.prepare(
				"INSERT INTO profile_memberships (profile_id, kind, project_key) VALUES ('removed', 'project', 'retained-member')",
			)
			.run();
		database
			.prepare(
				"UPDATE profile_registry_state SET selected_profile_id = 'removed'",
			)
			.run();
		expect(registry(store).memberships).toEqual([]);
		expect(registry(store).selectedProfileId).toBe(DEFAULT_PROFILE_ID);
		expect(
			database.prepare("SELECT project_key FROM profile_memberships").all(),
		).toEqual([{ project_key: "retained-member" }]);
	});

	it("atomically restores full snapshots with stable identities and idempotent revisions", () => {
		const work = store.create({ name: "Work" });
		store.move({ profileId: work.id, members: [project, session] });
		store.reorder({ profileIds: [work.id, DEFAULT_PROFILE_ID] });
		store.select({ profileId: work.id });
		store.visit({
			profileId: work.id,
			hostId: "local",
			workspaceId: "offline-session",
			visitedAt: 50,
		});
		const snapshot = store.serializeSnapshot();
		store.rename({ profileId: work.id, name: "Changed" });
		store.move({ profileId: DEFAULT_PROFILE_ID, members: [session] });
		store.select({ profileId: DEFAULT_PROFILE_ID });
		const revision = store.applySnapshot(snapshot).revision;
		expect(store.serializeSnapshot()).toEqual(snapshot);
		const events: ProfileChange[] = [];
		store.subscribe((event) => events.push(event));
		expect(
			store.applySnapshot({
				...snapshot,
				profiles: [...snapshot.profiles].reverse(),
				memberships: [...snapshot.memberships].reverse(),
			}),
		).toEqual({ revision });
		expect(events).toEqual([]);
		store.rename({ profileId: work.id, name: "Changed again" });
		const before = store.serializeSnapshot();
		database.exec(
			"CREATE TRIGGER reject_snapshot_visit BEFORE INSERT ON profile_workspace_visits BEGIN SELECT RAISE(ABORT, 'private visit detail'); END;",
		);
		expectCode(() => store.applySnapshot(snapshot), "PROFILE_UNAVAILABLE");
		expect(store.serializeSnapshot()).toEqual(before);
	});

	it("rejects invalid whole snapshots before any definitions, members, visits or selection change", () => {
		const work = store.create({ name: "Café" });
		store.move({ profileId: work.id, members: [project, session] });
		store.visit({
			profileId: work.id,
			hostId: "local",
			workspaceId: "offline-session",
			visitedAt: 50,
		});
		const before = store.serializeSnapshot();
		const invalid: Array<(snapshot: ProfileSnapshot) => unknown> = [
			(snapshot) => ({ ...snapshot, version: 2 }),
			(snapshot) => ({
				...snapshot,
				profiles: snapshot.profiles.filter((profile) => !profile.isDefault),
			}),
			(snapshot) => ({
				...snapshot,
				profiles: [
					...snapshot.profiles,
					{ ...snapshot.profiles[0], id: "second-default", sortOrder: 2 },
				],
			}),
			(snapshot) => ({
				...snapshot,
				profiles: [...snapshot.profiles, snapshot.profiles[1]],
			}),
			(snapshot) => ({
				...snapshot,
				profiles: [
					...snapshot.profiles,
					{
						...snapshot.profiles[1],
						id: "duplicate-name",
						name: "CAFE\u0301",
						sortOrder: 2,
					},
				],
			}),
			(snapshot) => ({
				...snapshot,
				memberships: [...snapshot.memberships, snapshot.memberships[0]],
			}),
			(snapshot) => ({
				...snapshot,
				memberships: [{ profileId: "missing", member: project }],
			}),
			(snapshot) => ({
				...snapshot,
				memberships: [{ profileId: DEFAULT_PROFILE_ID, member: project }],
			}),
			(snapshot) => ({
				...snapshot,
				memberships: [
					{ profileId: work.id, member: { kind: "task", id: "unsupported" } },
				],
			}),
			(snapshot) => ({
				...snapshot,
				visits: [...snapshot.visits, snapshot.visits[0]],
			}),
			(snapshot) => ({
				...snapshot,
				visits: [{ ...snapshot.visits[0], profileId: "missing" }],
			}),
			(snapshot) => ({ ...snapshot, selectedProfileId: "missing" }),
		];
		for (const invalidate of invalid) {
			expectCode(
				() => store.applySnapshot(invalidate(structuredClone(before))),
				"PROFILE_INVALID_SNAPSHOT",
			);
			expect(store.serializeSnapshot()).toEqual(before);
		}
	});
});
