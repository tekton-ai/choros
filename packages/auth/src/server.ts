import { db } from "@choros/db/client";
import * as authSchema from "@choros/db/schema/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { env } from "./env";

const desktopDevPort = process.env.DESKTOP_VITE_PORT || "5173";
const trustedOrigins = [
	env.NEXT_PUBLIC_API_URL,
	...(env.NEXT_PUBLIC_DESKTOP_URL ? [env.NEXT_PUBLIC_DESKTOP_URL] : []),
	"choros://app",
	"choros://",
	...(process.env.NODE_ENV === "development"
		? [
				`http://localhost:${desktopDevPort}`,
				`http://127.0.0.1:${desktopDevPort}`,
				"http://localhost:*",
				"http://127.0.0.1:*",
			]
		: []),
];

function withoutProviderTokens<Account extends Record<string, unknown>>(
	account: Account,
): Account {
	return {
		...account,
		accessToken: null,
		refreshToken: null,
		idToken: null,
		accessTokenExpiresAt: null,
		refreshTokenExpiresAt: null,
		scope: null,
	};
}

export const auth = betterAuth({
	baseURL: env.NEXT_PUBLIC_API_URL,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, {
		provider: "pg",
		usePlural: true,
		schema: authSchema,
	}),
	trustedOrigins,
	session: {
		expiresIn: 60 * 60 * 24 * 30,
		updateAge: 60 * 60 * 24,
		storeSessionInDatabase: true,
		cookieCache: {
			enabled: true,
			maxAge: 60 * 5,
		},
	},
	account: {
		accountLinking: {
			enabled: true,
		},
	},
	socialProviders: {
		github: {
			clientId: env.GH_CLIENT_ID,
			clientSecret: env.GH_CLIENT_SECRET,
			scope: ["read:user", "user:email"],
		},
		google: {
			clientId: env.GOOGLE_CLIENT_ID,
			clientSecret: env.GOOGLE_CLIENT_SECRET,
			scope: ["openid", "email", "profile"],
		},
	},
	databaseHooks: {
		account: {
			create: {
				before: async (account) => ({
					data: withoutProviderTokens(account),
				}),
			},
			update: {
				before: async (account) => ({
					data: withoutProviderTokens(account),
				}),
			},
		},
	},
	advanced: {
		database: {
			generateId: false,
		},
	},
	plugins: [bearer()],
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
