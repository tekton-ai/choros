import { caseFold } from "unicode-case-folding";
import { z } from "zod";

export const DEFAULT_PROFILE_ID = "default";
export const PROFILE_SNAPSHOT_VERSION = 1;

const identitySchema = z.string().min(1).max(512);

export function normalizeProfileName(name: string): string {
	return caseFold(name.trim().normalize("NFC")).normalize("NFC");
}

export const profileNameSchema = z
	.string()
	.transform((name) => name.trim())
	.refine((name) => {
		let length = 0;
		for (const _codePoint of name) {
			if (++length > 80) return false;
		}
		return length > 0;
	}, "Invalid profile name");

export const profileMemberRefSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("project"), projectKey: identitySchema }).strict(),
	z
		.object({
			kind: z.literal("session"),
			hostId: identitySchema,
			workspaceId: identitySchema,
		})
		.strict(),
]);

export type ProfileMemberRef = z.infer<typeof profileMemberRefSchema>;

export function profileMemberKey(member: ProfileMemberRef): string {
	return member.kind === "project"
		? JSON.stringify([member.kind, member.projectKey])
		: JSON.stringify([member.kind, member.hostId, member.workspaceId]);
}

export const profileDefinitionSchema = z
	.object({
		id: identitySchema,
		name: profileNameSchema,
		sortOrder: z.number().int().nonnegative(),
		isDefault: z.boolean(),
		createdAt: z.number().int().nonnegative(),
		updatedAt: z.number().int().nonnegative(),
	})
	.strict();

export type ProfileDefinition = z.infer<typeof profileDefinitionSchema>;

export const profileMembershipSchema = z
	.object({ profileId: identitySchema, member: profileMemberRefSchema })
	.strict();

export type ProfileMembership = z.infer<typeof profileMembershipSchema>;

export const profileVisitSchema = z
	.object({
		profileId: identitySchema,
		hostId: identitySchema,
		workspaceId: identitySchema,
		visitedAt: z.number().int().nonnegative(),
	})
	.strict();

export type ProfileVisit = z.infer<typeof profileVisitSchema>;

export interface ProfileRegistry {
	revision: number;
	profiles: ProfileDefinition[];
	memberships: ProfileMembership[];
	selectedProfileId: string;
}

export type ProfileRegistryResult =
	| { available: true; registry: ProfileRegistry }
	| { available: false; reason: "unavailable" };

export interface ProfileChange {
	revision: number;
	kind: "registry" | "visits" | "selection";
}

export const profileSnapshotSchema = z
	.object({
		version: z.literal(PROFILE_SNAPSHOT_VERSION),
		profiles: z.array(profileDefinitionSchema),
		memberships: z.array(profileMembershipSchema),
		visits: z.array(profileVisitSchema),
		selectedProfileId: identitySchema,
	})
	.strict();

export type ProfileSnapshot = z.infer<typeof profileSnapshotSchema>;

/** Renderer-only submission identity; never included in Host payloads. */
export interface ProfileSubmissionContext {
	profileId: string;
	requestId: string;
	generation: number;
}

export interface ProfileAssignmentResult {
	profileId: string;
	assigned: boolean;
}
