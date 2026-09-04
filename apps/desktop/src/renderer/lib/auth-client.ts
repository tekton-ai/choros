import { createAuthClient } from "better-auth/react";
import { useSyncExternalStore } from "react";
import { env } from "renderer/env.renderer";

let authToken: string | null = null;
const authTokenListeners = new Set<() => void>();

function subscribeAuthToken(listener: () => void): () => void {
	authTokenListeners.add(listener);
	return () => authTokenListeners.delete(listener);
}

export function setAuthToken(token: string | null): void {
	if (authToken === token) return;
	authToken = token;
	for (const listener of authTokenListeners) listener();
}

export function getAuthToken(): string | null {
	return authToken;
}

export function useAuthToken(): string | null {
	return useSyncExternalStore(subscribeAuthToken, getAuthToken, () => null);
}

export const authClient = createAuthClient({
	baseURL: env.NEXT_PUBLIC_API_URL,
	fetchOptions: {
		credentials: "include",
		onRequest: async (context) => {
			const token = getAuthToken();
			if (token) context.headers.set("Authorization", `Bearer ${token}`);
		},
	},
});
