import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { profileStore } from "main/lib/profiles";
import { ProfileStoreError } from "main/lib/profiles/profile-store";
import {
	type ProfileChange,
	profileMemberRefSchema,
	profileNameSchema,
	profileVisitSchema,
} from "shared/profiles";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const identity = z.string().min(1).max(512);
const profileInput = z.object({ profileId: identity }).strict();

function callProfileStore<T>(operation: () => T): T {
	try {
		return operation();
	} catch (error) {
		const code =
			error instanceof ProfileStoreError ? error.code : "PROFILE_UNAVAILABLE";
		throw new TRPCError({
			code:
				code === "PROFILE_UNAVAILABLE"
					? "SERVICE_UNAVAILABLE"
					: code === "PROFILE_NOT_FOUND"
						? "NOT_FOUND"
						: code === "PROFILE_NAME_CONFLICT" || code === "PROFILE_NOT_EMPTY"
							? "CONFLICT"
							: "BAD_REQUEST",
			message: code,
			cause: { kind: "profile", code },
		});
	}
}

export const createProfilesRouter = () =>
	router({
		get: publicProcedure.query(() => profileStore.get()),
		visits: publicProcedure
			.input(profileInput)
			.query(({ input }) => callProfileStore(() => profileStore.visits(input))),
		create: publicProcedure
			.input(z.object({ name: profileNameSchema }).strict())
			.mutation(({ input }) =>
				callProfileStore(() => profileStore.create(input)),
			),
		rename: publicProcedure
			.input(profileInput.extend({ name: profileNameSchema }))
			.mutation(({ input }) =>
				callProfileStore(() => profileStore.rename(input)),
			),
		reorder: publicProcedure
			.input(z.object({ profileIds: z.array(identity) }).strict())
			.mutation(({ input }) =>
				callProfileStore(() => profileStore.reorder(input)),
			),
		move: publicProcedure
			.input(
				profileInput.extend({
					members: z.array(profileMemberRefSchema).min(1),
				}),
			)
			.mutation(({ input }) =>
				callProfileStore(() => profileStore.move(input)),
			),
		delete: publicProcedure
			.input(
				profileInput.extend({
					moveToDefault: z.boolean(),
					confirmed: z.boolean(),
				}),
			)
			.mutation(({ input }) =>
				callProfileStore(() => profileStore.delete(input)),
			),
		select: publicProcedure
			.input(profileInput)
			.mutation(({ input }) =>
				callProfileStore(() => profileStore.select(input)),
			),
		visit: publicProcedure
			.input(profileVisitSchema)
			.mutation(({ input }) =>
				callProfileStore(() => profileStore.visit(input)),
			),
		onChanged: publicProcedure.subscription(() =>
			observable<ProfileChange>((emit) =>
				profileStore.subscribe((change) => emit.next(change)),
			),
		),
	});
