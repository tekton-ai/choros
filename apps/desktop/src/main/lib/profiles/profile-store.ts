import { randomUUID } from "node:crypto";
import {
	DEFAULT_PROFILE_ID,
	normalizeProfileName,
	PROFILE_SNAPSHOT_VERSION,
	type ProfileChange,
	type ProfileDefinition,
	type ProfileMemberRef,
	type ProfileMembership,
	type ProfileRegistry,
	type ProfileRegistryResult,
	type ProfileSnapshot,
	type ProfileVisit,
	profileDefinitionSchema,
	profileMemberKey,
	profileMemberRefSchema,
	profileNameSchema,
	profileSnapshotSchema,
	profileVisitSchema,
} from "shared/profiles";
import type { SyncSqlite } from "../local-db/sync-sqlite";

export type ProfileErrorCode =
	| "PROFILE_UNAVAILABLE"
	| "PROFILE_INVALID_INPUT"
	| "PROFILE_NAME_CONFLICT"
	| "PROFILE_NOT_FOUND"
	| "PROFILE_DEFAULT_REQUIRED"
	| "PROFILE_NOT_EMPTY"
	| "PROFILE_CONFIRMATION_REQUIRED"
	| "PROFILE_INVALID_SNAPSHOT";

/** Never retain a driver cause: it may contain names, IDs or bound SQL. */
export class ProfileStoreError extends Error {
	readonly kind = "profile";
	constructor(readonly code: ProfileErrorCode) {
		super(code);
		this.name = "ProfileStoreError";
	}
}

interface DefinitionRow {
	id: string;
	name: string;
	name_key: string;
	sort_order: number;
	is_default: number;
	created_at: number;
	updated_at: number;
}
interface MembershipRow {
	profile_id: string;
	kind: string;
	project_key: string | null;
	host_id: string | null;
	workspace_id: string | null;
}
interface RegistryState {
	id: number;
	revision: number;
	selected_profile_id: string;
}

function fail(code: ProfileErrorCode): never {
	throw new ProfileStoreError(code);
}

function validIdentity(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && value.length <= 512;
}

function compareIdentity(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

function canonicalSnapshot(snapshot: ProfileSnapshot): ProfileSnapshot {
	return {
		version: PROFILE_SNAPSHOT_VERSION,
		profiles: [...snapshot.profiles].sort((a, b) => a.sortOrder - b.sortOrder),
		memberships: [...snapshot.memberships].sort((a, b) => {
			if (a.member.kind === "project" && b.member.kind === "project")
				return compareIdentity(a.member.projectKey, b.member.projectKey);
			if (a.member.kind === "session" && b.member.kind === "session")
				return (
					compareIdentity(a.member.hostId, b.member.hostId) ||
					compareIdentity(a.member.workspaceId, b.member.workspaceId)
				);
			return compareIdentity(a.member.kind, b.member.kind);
		}),
		visits: [...snapshot.visits].sort(
			(a, b) =>
				compareIdentity(a.profileId, b.profileId) ||
				compareIdentity(a.hostId, b.hostId) ||
				compareIdentity(a.workspaceId, b.workspaceId),
		),
		selectedProfileId: snapshot.selectedProfileId,
	};
}

/** Validate the complete replacement before touching SQLite; no Host lookup. */
export function validateProfileSnapshot(input: unknown): ProfileSnapshot {
	const parsed = profileSnapshotSchema.safeParse(input);
	if (!parsed.success) return fail("PROFILE_INVALID_SNAPSHOT");
	const snapshot = canonicalSnapshot(parsed.data);
	const ids = new Set<string>();
	const names = new Set<string>();
	let defaults = 0;
	for (const [index, profile] of snapshot.profiles.entries()) {
		const nameKey = normalizeProfileName(profile.name);
		if (
			ids.has(profile.id) ||
			names.has(nameKey) ||
			profile.sortOrder !== index ||
			profile.isDefault !== (profile.id === DEFAULT_PROFILE_ID)
		) {
			return fail("PROFILE_INVALID_SNAPSHOT");
		}
		ids.add(profile.id);
		names.add(nameKey);
		if (profile.isDefault) defaults++;
	}
	if (defaults !== 1 || !ids.has(snapshot.selectedProfileId)) {
		return fail("PROFILE_INVALID_SNAPSHOT");
	}
	const members = new Set<string>();
	for (const membership of snapshot.memberships) {
		const key = profileMemberKey(membership.member);
		if (
			!ids.has(membership.profileId) ||
			membership.profileId === DEFAULT_PROFILE_ID ||
			members.has(key)
		) {
			return fail("PROFILE_INVALID_SNAPSHOT");
		}
		members.add(key);
	}
	const visits = new Set<string>();
	for (const visit of snapshot.visits) {
		const key = JSON.stringify([
			visit.profileId,
			visit.hostId,
			visit.workspaceId,
		]);
		if (!ids.has(visit.profileId) || visits.has(key))
			return fail("PROFILE_INVALID_SNAPSHOT");
		visits.add(key);
	}
	return snapshot;
}

export class ProfileStore {
	private readonly listeners = new Set<(change: ProfileChange) => void>();

	constructor(private readonly database: SyncSqlite) {}

	subscribe(listener: (change: ProfileChange) => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private readState(): RegistryState {
		const rows = this.database
			.prepare("SELECT * FROM profile_registry_state")
			.all() as RegistryState[];
		const state = rows[0];
		if (
			rows.length !== 1 ||
			!state ||
			state.id !== 1 ||
			!Number.isSafeInteger(state.revision) ||
			state.revision < 0 ||
			!validIdentity(state.selected_profile_id)
		)
			return fail("PROFILE_UNAVAILABLE");
		return state;
	}

	private initialize(): boolean {
		const definitions = this.database
			.prepare("SELECT id, is_default FROM profiles")
			.all() as Array<{ id: string; is_default: number }>;
		const stateRows = this.database
			.prepare("SELECT id FROM profile_registry_state")
			.all();
		// Probe every table before initialization: a partially migrated registry is
		// unavailable, not an invitation to replace it with a synthetic empty one.
		const hasMembers = this.database
			.prepare("SELECT 1 FROM profile_memberships LIMIT 1")
			.get();
		const hasVisits = this.database
			.prepare("SELECT 1 FROM profile_workspace_visits LIMIT 1")
			.get();
		if (definitions.length === 0) {
			if (stateRows.length || hasMembers || hasVisits)
				return fail("PROFILE_UNAVAILABLE");
			const now = Date.now();
			this.insertDefinition({
				id: DEFAULT_PROFILE_ID,
				name: "Default",
				sortOrder: 0,
				isDefault: true,
				createdAt: now,
				updatedAt: now,
			});
			this.database
				.prepare(
					"INSERT INTO profile_registry_state (id, revision, selected_profile_id) VALUES (1, 0, ?)",
				)
				.run(DEFAULT_PROFILE_ID);
			return true;
		}
		const defaults = definitions.filter(
			(profile) =>
				profile.is_default === 1 || profile.id === DEFAULT_PROFILE_ID,
		);
		if (
			defaults.length !== 1 ||
			defaults[0]?.id !== DEFAULT_PROFILE_ID ||
			defaults[0]?.is_default !== 1
		)
			return fail("PROFILE_UNAVAILABLE");
		this.readState();
		return false;
	}

	private execute<T>(
		kind: ProfileChange["kind"],
		operation: () => { value: T; changed: boolean },
	): { value: T; revision: number } {
		let result: {
			value: T;
			revision: number;
			changed: boolean;
			initialized: boolean;
		};
		try {
			result = this.database.transaction(() => {
				const initialized = this.initialize();
				const outcome = operation();
				const changed = initialized || outcome.changed;
				if (changed)
					this.database
						.prepare(
							"UPDATE profile_registry_state SET revision = revision + 1 WHERE id = 1",
						)
						.run();
				return {
					value: outcome.value,
					revision: this.readState().revision,
					changed,
					initialized,
				};
			})();
		} catch (error) {
			if (error instanceof ProfileStoreError) throw error;
			return fail("PROFILE_UNAVAILABLE");
		}
		// Subscribers cannot turn a committed write into an apparent failure.
		if (result.changed) {
			const change: ProfileChange = {
				revision: result.revision,
				kind: result.initialized ? "registry" : kind,
			};
			for (const listener of this.listeners) {
				try {
					listener(change);
				} catch {
					/* One closed renderer must not affect other windows. */
				}
			}
		}
		return result;
	}

	private definitions(): ProfileDefinition[] {
		const rows = this.database
			.prepare("SELECT * FROM profiles ORDER BY sort_order, id")
			.all() as DefinitionRow[];
		return rows.map((row) => {
			const parsed = profileDefinitionSchema.safeParse({
				id: row.id,
				name: row.name,
				sortOrder: row.sort_order,
				isDefault: row.is_default === 1,
				createdAt: row.created_at,
				updatedAt: row.updated_at,
			});
			if (
				!parsed.success ||
				(row.is_default !== 0 && row.is_default !== 1) ||
				normalizeProfileName(row.name) !== row.name_key
			)
				return fail("PROFILE_UNAVAILABLE");
			return parsed.data;
		});
	}

	private memberships(): ProfileMembership[] {
		const rows = this.database
			.prepare(
				"SELECT * FROM profile_memberships ORDER BY kind, project_key, host_id, workspace_id",
			)
			.all() as MembershipRow[];
		return rows.map((row) => {
			const parsed = profileMemberRefSchema.safeParse(
				row.kind === "project" &&
					row.host_id === null &&
					row.workspace_id === null
					? { kind: row.kind, projectKey: row.project_key }
					: row.kind === "session" && row.project_key === null
						? {
								kind: row.kind,
								hostId: row.host_id,
								workspaceId: row.workspace_id,
							}
						: null,
			);
			if (!parsed.success || !validIdentity(row.profile_id))
				return fail("PROFILE_UNAVAILABLE");
			return { profileId: row.profile_id, member: parsed.data };
		});
	}

	private requireProfile(profileId: string): void {
		if (!validIdentity(profileId)) fail("PROFILE_INVALID_INPUT");
		if (
			!this.database
				.prepare("SELECT id FROM profiles WHERE id = ?")
				.get(profileId)
		)
			fail("PROFILE_NOT_FOUND");
	}

	private parseName(name: string): string {
		const parsed = profileNameSchema.safeParse(name);
		if (!parsed.success) return fail("PROFILE_INVALID_INPUT");
		return parsed.data;
	}

	private ensureNameAvailable(name: string, exceptId?: string): void {
		const existing = this.database
			.prepare("SELECT id FROM profiles WHERE name_key = ?")
			.get(normalizeProfileName(name)) as { id: string } | undefined;
		if (existing && existing.id !== exceptId) fail("PROFILE_NAME_CONFLICT");
	}

	private insertDefinition(profile: ProfileDefinition): void {
		this.database
			.prepare(
				"INSERT INTO profiles (id, name, name_key, sort_order, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			)
			.run(
				profile.id,
				profile.name,
				normalizeProfileName(profile.name),
				profile.sortOrder,
				Number(profile.isDefault),
				profile.createdAt,
				profile.updatedAt,
			);
	}

	get(): ProfileRegistryResult {
		try {
			const result = this.execute("registry", () => {
				const profiles = this.definitions();
				const ids = new Set(profiles.map((profile) => profile.id));
				const state = this.readState();
				const registry: ProfileRegistry = {
					revision: state.revision,
					profiles,
					memberships: this.memberships().filter(
						(membership) =>
							membership.profileId !== DEFAULT_PROFILE_ID &&
							ids.has(membership.profileId),
					),
					selectedProfileId: ids.has(state.selected_profile_id)
						? state.selected_profile_id
						: DEFAULT_PROFILE_ID,
				};
				return { value: registry, changed: false };
			});
			result.value.revision = result.revision;
			return { available: true, registry: result.value };
		} catch {
			return { available: false, reason: "unavailable" };
		}
	}

	create(input: { name: string }): ProfileDefinition {
		const name = this.parseName(input.name);
		return this.execute("registry", () => {
			this.ensureNameAvailable(name);
			const now = Date.now();
			const count = this.database
				.prepare("SELECT count(*) AS count FROM profiles")
				.get() as { count: number };
			const profile: ProfileDefinition = {
				id: randomUUID(),
				name,
				sortOrder: count.count,
				isDefault: false,
				createdAt: now,
				updatedAt: now,
			};
			this.insertDefinition(profile);
			return { value: profile, changed: true };
		}).value;
	}

	rename(input: { profileId: string; name: string }): { revision: number } {
		const name = this.parseName(input.name);
		return {
			revision: this.execute("registry", () => {
				this.requireProfile(input.profileId);
				this.ensureNameAvailable(name, input.profileId);
				const current = this.database
					.prepare("SELECT name FROM profiles WHERE id = ?")
					.get(input.profileId) as { name: string };
				if (current.name === name) return { value: undefined, changed: false };
				this.database
					.prepare(
						"UPDATE profiles SET name = ?, name_key = ?, updated_at = ? WHERE id = ?",
					)
					.run(name, normalizeProfileName(name), Date.now(), input.profileId);
				return { value: undefined, changed: true };
			}).revision,
		};
	}

	reorder(input: { profileIds: string[] }): { revision: number } {
		return {
			revision: this.execute("registry", () => {
				const profiles = this.definitions();
				const profileIds = new Set(profiles.map((profile) => profile.id));
				if (
					!Array.isArray(input.profileIds) ||
					input.profileIds.length !== profiles.length ||
					new Set(input.profileIds).size !== profiles.length ||
					input.profileIds.some((id) => !profileIds.has(id))
				)
					return fail("PROFILE_INVALID_INPUT");
				const changed = profiles.some(
					(profile, index) => profile.id !== input.profileIds[index],
				);
				if (changed) {
					const update = this.database.prepare(
						"UPDATE profiles SET sort_order = ?, updated_at = ? WHERE id = ?",
					);
					const now = Date.now();
					input.profileIds.forEach((id, index) => {
						update.run(index, now, id);
					});
				}
				return { value: undefined, changed };
			}).revision,
		};
	}

	move(input: { profileId: string; members: ProfileMemberRef[] }): {
		revision: number;
	} {
		if (!Array.isArray(input.members) || input.members.length === 0)
			return fail("PROFILE_INVALID_INPUT");
		const keys = new Set<string>();
		const members = input.members.map((member) => {
			const parsed = profileMemberRefSchema.safeParse(member);
			if (!parsed.success) return fail("PROFILE_INVALID_INPUT");
			const key = profileMemberKey(parsed.data);
			if (keys.has(key)) return fail("PROFILE_INVALID_INPUT");
			keys.add(key);
			return parsed.data;
		});
		return {
			revision: this.execute("registry", () => {
				this.requireProfile(input.profileId);
				let changed = false;
				const upsert = this.database.prepare(
					"INSERT INTO profile_memberships (profile_id, kind, project_key, host_id, workspace_id) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET profile_id = excluded.profile_id",
				);
				for (const member of members) {
					const predicate =
						member.kind === "project"
							? "kind = 'project' AND project_key = ?"
							: "kind = 'session' AND host_id = ? AND workspace_id = ?";
					const values =
						member.kind === "project"
							? [member.projectKey]
							: [member.hostId, member.workspaceId];
					const current = this.database
						.prepare(
							`SELECT profile_id FROM profile_memberships WHERE ${predicate}`,
						)
						.get(...values) as { profile_id: string } | undefined;
					if ((current?.profile_id ?? DEFAULT_PROFILE_ID) === input.profileId)
						continue;
					if (input.profileId === DEFAULT_PROFILE_ID) {
						this.database
							.prepare(`DELETE FROM profile_memberships WHERE ${predicate}`)
							.run(...values);
					} else {
						upsert.run(
							input.profileId,
							member.kind,
							member.kind === "project" ? member.projectKey : null,
							member.kind === "session" ? member.hostId : null,
							member.kind === "session" ? member.workspaceId : null,
						);
					}
					changed = true;
				}
				return { value: undefined, changed };
			}).revision,
		};
	}

	delete(input: {
		profileId: string;
		moveToDefault: boolean;
		confirmed: boolean;
	}): { revision: number } {
		return {
			revision: this.execute("registry", () => {
				this.requireProfile(input.profileId);
				if (input.profileId === DEFAULT_PROFILE_ID)
					return fail("PROFILE_DEFAULT_REQUIRED");
				if (input.confirmed !== true)
					return fail("PROFILE_CONFIRMATION_REQUIRED");
				const member = this.database
					.prepare(
						"SELECT 1 FROM profile_memberships WHERE profile_id = ? LIMIT 1",
					)
					.get(input.profileId);
				if (member && input.moveToDefault !== true)
					return fail("PROFILE_NOT_EMPTY");
				this.database
					.prepare("DELETE FROM profile_memberships WHERE profile_id = ?")
					.run(input.profileId);
				this.database
					.prepare("DELETE FROM profile_workspace_visits WHERE profile_id = ?")
					.run(input.profileId);
				this.database
					.prepare(
						"UPDATE profile_registry_state SET selected_profile_id = ? WHERE selected_profile_id = ?",
					)
					.run(DEFAULT_PROFILE_ID, input.profileId);
				this.database
					.prepare("DELETE FROM profiles WHERE id = ?")
					.run(input.profileId);
				const update = this.database.prepare(
					"UPDATE profiles SET sort_order = ?, updated_at = ? WHERE id = ?",
				);
				const now = Date.now();
				this.definitions().forEach((profile, index) => {
					if (profile.sortOrder !== index) update.run(index, now, profile.id);
				});
				return { value: undefined, changed: true };
			}).revision,
		};
	}

	select(input: { profileId: string }): { revision: number } {
		return {
			revision: this.execute("selection", () => {
				this.requireProfile(input.profileId);
				const changed =
					this.readState().selected_profile_id !== input.profileId;
				if (changed)
					this.database
						.prepare(
							"UPDATE profile_registry_state SET selected_profile_id = ? WHERE id = 1",
						)
						.run(input.profileId);
				return { value: undefined, changed };
			}).revision,
		};
	}

	private readVisits(profileId?: string): ProfileVisit[] {
		const rows = this.database
			.prepare(
				`SELECT profile_id AS profileId, host_id AS hostId, workspace_id AS workspaceId, visited_at AS visitedAt FROM profile_workspace_visits${profileId === undefined ? "" : " WHERE profile_id = ?"} ORDER BY visited_at DESC, host_id, workspace_id`,
			)
			.all(...(profileId === undefined ? [] : [profileId]));
		return rows.map((row) => {
			const parsed = profileVisitSchema.safeParse(row);
			if (!parsed.success) return fail("PROFILE_UNAVAILABLE");
			return parsed.data;
		});
	}

	visits(input: { profileId: string }): ProfileVisit[] {
		return this.execute("visits", () => {
			this.requireProfile(input.profileId);
			return { value: this.readVisits(input.profileId), changed: false };
		}).value;
	}

	visit(input: ProfileVisit): { revision: number } {
		const parsed = profileVisitSchema.safeParse(input);
		if (!parsed.success) return fail("PROFILE_INVALID_INPUT");
		const visit = parsed.data;
		return {
			revision: this.execute("visits", () => {
				this.requireProfile(visit.profileId);
				const current = this.database
					.prepare(
						"SELECT visited_at FROM profile_workspace_visits WHERE profile_id = ? AND host_id = ? AND workspace_id = ?",
					)
					.get(visit.profileId, visit.hostId, visit.workspaceId) as
					| { visited_at: number }
					| undefined;
				if (current && current.visited_at >= visit.visitedAt)
					return { value: undefined, changed: false };
				this.database
					.prepare(
						"INSERT INTO profile_workspace_visits (profile_id, host_id, workspace_id, visited_at) VALUES (?, ?, ?, ?) ON CONFLICT (profile_id, host_id, workspace_id) DO UPDATE SET visited_at = excluded.visited_at",
					)
					.run(
						visit.profileId,
						visit.hostId,
						visit.workspaceId,
						visit.visitedAt,
					);
				return { value: undefined, changed: true };
			}).revision,
		};
	}

	private readSnapshot(): ProfileSnapshot {
		return validateProfileSnapshot({
			version: PROFILE_SNAPSHOT_VERSION,
			profiles: this.definitions(),
			memberships: this.memberships(),
			visits: this.readVisits(),
			selectedProfileId: this.readState().selected_profile_id,
		});
	}

	serializeSnapshot(): ProfileSnapshot {
		return this.execute("registry", () => ({
			value: this.readSnapshot(),
			changed: false,
		})).value;
	}

	applySnapshot(input: unknown): { revision: number } {
		const snapshot = validateProfileSnapshot(input);
		return {
			revision: this.execute("registry", () => {
				if (JSON.stringify(this.readSnapshot()) === JSON.stringify(snapshot))
					return { value: undefined, changed: false };
				this.database.exec(
					"DELETE FROM profile_memberships; DELETE FROM profile_workspace_visits; DELETE FROM profiles;",
				);
				for (const profile of snapshot.profiles) this.insertDefinition(profile);
				const memberInsert = this.database.prepare(
					"INSERT INTO profile_memberships (profile_id, kind, project_key, host_id, workspace_id) VALUES (?, ?, ?, ?, ?)",
				);
				for (const { profileId, member } of snapshot.memberships)
					memberInsert.run(
						profileId,
						member.kind,
						member.kind === "project" ? member.projectKey : null,
						member.kind === "session" ? member.hostId : null,
						member.kind === "session" ? member.workspaceId : null,
					);
				const visitInsert = this.database.prepare(
					"INSERT INTO profile_workspace_visits (profile_id, host_id, workspace_id, visited_at) VALUES (?, ?, ?, ?)",
				);
				for (const visit of snapshot.visits)
					visitInsert.run(
						visit.profileId,
						visit.hostId,
						visit.workspaceId,
						visit.visitedAt,
					);
				this.database
					.prepare(
						"UPDATE profile_registry_state SET selected_profile_id = ? WHERE id = 1",
					)
					.run(snapshot.selectedProfileId);
				return { value: undefined, changed: true };
			}).revision,
		};
	}
}
