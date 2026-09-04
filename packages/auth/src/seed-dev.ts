import { db } from "@choros/db/client";
import { users } from "@choros/db/schema/auth";
import { DEV_EMAIL, DEV_NAME } from "@choros/shared/dev-credentials";

async function seedDevUser(): Promise<void> {
	if (process.env.NODE_ENV !== "development") {
		throw new Error("seed-dev is local-development only");
	}
	await db
		.insert(users)
		.values({
			name: DEV_NAME,
			email: DEV_EMAIL,
			emailVerified: true,
		})
		.onConflictDoNothing({ target: users.email });
	console.log(`Dev user ready: ${DEV_EMAIL}`);
}

seedDevUser().catch((error) => {
	console.error("seed-dev failed:", error);
	process.exitCode = 1;
});
