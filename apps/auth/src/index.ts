/// <reference types="@cloudflare/workers-types" />

/**
 * Choros auth server. Cloudflare Workers deployment of the same
 * OAuth-broker shape as `scripts/auth-dev-server.ts` — one central instance
 * serves every environment (local dev, staging, prod), each identified by
 * the `protocol` query param the desktop passes at sign-in kickoff.
 *
 * Same three surfaces as the dev script:
 *   /api/auth/*                — better-auth handler
 *   /api/auth/desktop/connect  — desktop OAuth initiator
 *   /auth/desktop/success      — post-OAuth landing → deep-link back
 *
 * Runtime differences from the Node script:
 *   - `serve()` from @hono/node-server is replaced by Workers' native
 *     fetch export.
 *   - `node:crypto.randomBytes` is replaced by Web Crypto.
 *   - Env vars come from the Workers execution context, not process.env.
 *     Better-auth reads its config from `env` inside the `packages/auth`
 *     module, which uses `process.env` — Workers polyfills that when
 *     `nodejs_compat` is enabled (see wrangler.toml).
 */

import { auth } from "@choros/auth/server";
import { db } from "@choros/db/client";
import { usageEvents } from "@choros/db/schema";
import { sessions } from "@choros/db/schema/auth";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { handleUsageEvent } from "./usage";

type Env = {
	AUTH_SELF_URL: string; // e.g. https://auth.choros.sh
};

const app = new Hono<{ Bindings: Env }>();

app.use(
	"/api/auth/*",
	cors({
		origin: (origin) => origin ?? "*",
		credentials: true,
	}),
);
app.use(
	"/api/usage/*",
	cors({
		origin: (origin) => origin ?? "*",
		credentials: true,
	}),
);

app.get("/api/auth/desktop/connect", async (c) => {
	const provider = c.req.query("provider");
	const state = c.req.query("state");
	const protocol = c.req.query("protocol") ?? "choros";
	const localCallback = c.req.query("local_callback");

	if (!provider || !state) return c.text("Missing provider or state", 400);
	if (provider !== "google" && provider !== "github") {
		return c.text("Invalid provider", 400);
	}

	const successUrl = new URL(`${c.env.AUTH_SELF_URL}/auth/desktop/success`);
	successUrl.searchParams.set("desktop_state", state);
	successUrl.searchParams.set("desktop_protocol", protocol);

	// Linux fallback: Electron's deep-link handler is flaky on some distros,
	// so the desktop passes a loopback callback we round-trip through the
	// success page. Trust only http://127.0.0.1|localhost with path
	// /auth/callback — anything else is dropped silently.
	if (localCallback) {
		try {
			const cb = new URL(localCallback);
			const loopback =
				cb.protocol === "http:" &&
				(cb.hostname === "127.0.0.1" || cb.hostname === "localhost");
			if (loopback && cb.pathname === "/auth/callback") {
				successUrl.searchParams.set("desktop_local_callback", cb.toString());
			}
		} catch {
			// Malformed URL → ignore; the deep-link path still works.
		}
	}

	const result = await auth.api.signInSocial({
		body: { provider, callbackURL: successUrl.toString() },
		asResponse: true,
	});
	const body = (await result.json()) as { url?: string };
	if (!body.url) {
		return c.text(`Failed to initiate OAuth: ${JSON.stringify(body)}`, 500);
	}

	const headers = new Headers({ Location: body.url });
	for (const cookie of result.headers.getSetCookie()) {
		headers.append("set-cookie", cookie);
	}
	return new Response(null, { status: 302, headers });
});

app.get("/auth/desktop/success", async (c) => {
	const state = c.req.query("desktop_state");
	const protocol = c.req.query("desktop_protocol") ?? "choros";
	const localCallbackBase = c.req.query("desktop_local_callback");

	if (!state) return c.text("Missing auth state", 400);

	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) return c.text("Authentication failed", 401);

	// Independent bearer session for the desktop app. Product data remains local;
	// this session only authenticates the account and usage-event write.
	const tokenBytes = new Uint8Array(32);
	crypto.getRandomValues(tokenBytes);
	const token = base64urlEncode(tokenBytes);
	const expiresAt = new Date(Date.now() + 60 * 60 * 24 * 30 * 1000);

	await db.insert(sessions).values({
		token,
		userId: session.user.id,
		expiresAt,
		updatedAt: new Date(),
	});

	const deepLink = `${protocol}://auth/callback?token=${encodeURIComponent(token)}&expiresAt=${encodeURIComponent(expiresAt.toISOString())}&state=${encodeURIComponent(state)}`;
	const targetUrl = localCallbackBase
		? `${localCallbackBase}?token=${encodeURIComponent(token)}&expiresAt=${encodeURIComponent(expiresAt.toISOString())}&state=${encodeURIComponent(state)}`
		: deepLink;

	return c.html(
		`<!doctype html>
<meta charset="utf-8">
<title>Choros — Redirecting</title>
<style>body{font:14px system-ui;color:#d6d1c9;background:#151110;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}a{color:#a09a90}</style>
<script>window.location.href = ${JSON.stringify(targetUrl)};</script>
<div><p>Redirecting to Choros…</p><p><a href=${JSON.stringify(targetUrl)}>Click here if not redirected</a></p></div>`,
	);
});

app.post("/api/usage/events", (c) =>
	handleUsageEvent(c.req.raw, {
		getUserId: async (headers) =>
			(await auth.api.getSession({ headers }))?.user.id ?? null,
		insertEvent: async (event) => {
			await db
				.insert(usageEvents)
				.values(event)
				.onConflictDoNothing({ target: usageEvents.id });
		},
	}),
);

app.get("/", (c) =>
	c.text(
		`Choros auth server\n\n` +
			`Endpoints:\n` +
			`  /api/auth/*                 — better-auth handler\n` +
			`  /api/auth/desktop/connect   — desktop OAuth initiator\n` +
			`  /auth/desktop/success      — post-OAuth landing\n` +
			`  /api/usage/events          — authenticated desktop-open event\n`,
	),
);

// Registered LAST so the desktop-specific routes above win — Hono matches
// in registration order, and better-auth's handler would 404 on anything
// it doesn't know about (like /api/auth/desktop/connect).
app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

export default app;

// -------- helpers --------

// Web Crypto has no base64url helper; do it once here so the token format
// matches what node:crypto.randomBytes(...).toString("base64url") produced
// in the dev-server script.
function base64urlEncode(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}
