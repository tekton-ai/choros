#!/usr/bin/env bun
/**
 * Local dev auth server. Replaces the retired apps/api's /api/auth/**
 * routes so the desktop GitHub/Google sign-in flow works end-to-end
 * without a deployed backend.
 *
 * Serves three surfaces, all off one Hono app on http://localhost:3001:
 *
 *   /api/auth/*                — better-auth's built-in handler (sessions,
 *                                 tokens, callback/{github,google}, jwks…).
 *   /api/auth/desktop/connect  — desktop-specific OAuth initiator: preserves
 *                                 the desktop's per-launch `state` and the
 *                                 protocol scheme so the deep-link callback
 *                                 can be verified against the state store
 *                                 in `apps/desktop/src/lib/trpc/routers/auth`.
 *   /auth/desktop/success      — post-OAuth landing. Reads the better-auth
 *                                 cookie session set by the provider's
 *                                 callback, mints a bearer-token session for
 *                                 the desktop app (independent of the web
 *                                 cookie session, so activeOrganizationId
 *                                 can diverge), and redirects the system
 *                                 browser into the Electron custom scheme.
 *
 * Run alongside `bun run dev`; the desktop's NEXT_PUBLIC_API_URL already
 * points at http://localhost:3001. Turn off SKIP_ENV_VALIDATION in .env
 * to route the sign-in page here instead of the mock-session bypass.
 */

import { randomBytes } from "node:crypto";
import { auth } from "@choros/auth/server";
import { db } from "@choros/db/client";
import { sessions } from "@choros/db/schema/auth";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

const PORT = Number(process.env.AUTH_DEV_PORT ?? 3001);
const SELF_URL = `http://localhost:${PORT}`;

const app = new Hono();

// Desktop uses bearer tokens after sign-in (see apps/desktop/src/renderer/
// lib/auth-client.ts), but the OAuth *initiation* path uses better-auth
// cookies to carry CSRF state through the redirect chain. Reflect the origin
// and allow credentials so both flows work from Electron and the system
// browser.
app.use(
	"/api/auth/*",
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

	if (!provider || !state) {
		return c.text("Missing provider or state", 400);
	}
	if (provider !== "google" && provider !== "github") {
		return c.text("Invalid provider", 400);
	}

	// Local-only successUrl: we host /auth/desktop/success on this same
	// server so we don't need a separate `apps/web` deployment for dev.
	const successUrl = new URL(`${SELF_URL}/auth/desktop/success`);
	successUrl.searchParams.set("desktop_state", state);
	successUrl.searchParams.set("desktop_protocol", protocol);

	// Linux fallback: Electron's deep-link handler is flaky on some
	// distros, so the desktop passes a loopback callback we round-trip
	// through the success page. Trust only http://127.0.0.1|localhost with
	// path /auth/callback — anything else is dropped silently.
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

	// Carry better-auth's CSRF cookies through the redirect. The GH/Google
	// callback needs them to bind the returned code to this session.
	const headers = new Headers({ Location: body.url });
	for (const cookie of result.headers.getSetCookie()) {
		headers.append("set-cookie", cookie);
	}
	return new Response(null, { status: 302, headers });
});

// Registered LAST so the desktop-specific routes above win — Hono matches
// in registration order, and better-auth's handler would 404 on anything
// it doesn't know about (like /api/auth/desktop/connect).
app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/auth/desktop/success", async (c) => {
	const state = c.req.query("desktop_state");
	const protocol = c.req.query("desktop_protocol") ?? "choros";
	const localCallbackBase = c.req.query("desktop_local_callback");

	if (!state) return c.text("Missing auth state", 400);

	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) return c.text("Authentication failed", 401);

	// Desktop session is bearer-token backed and independent of the
	// browser's cookie session so the two can hold different
	// activeOrganizationId values (matches production behaviour).
	const token = randomBytes(32).toString("base64url");
	const expiresAt = new Date(Date.now() + 60 * 60 * 24 * 30 * 1000);
	await db.insert(sessions).values({
		token,
		userId: session.user.id,
		expiresAt,
		userAgent: c.req.header("user-agent") ?? "Choros Desktop App",
		ipAddress:
			c.req.header("x-forwarded-for")?.split(",")[0] ??
			c.req.header("x-real-ip") ??
			undefined,
		activeOrganizationId: session.session.activeOrganizationId,
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

app.get("/", (c) =>
	c.text(
		`[auth-dev] Choros local auth server\n\n` +
			`Endpoints:\n` +
			`  POST /api/auth/*                — better-auth handler\n` +
			`  GET  /api/auth/desktop/connect  — desktop OAuth initiator\n` +
			`  GET  /auth/desktop/success      — post-OAuth landing\n\n` +
			`Point the desktop at NEXT_PUBLIC_API_URL=${SELF_URL} and unset\n` +
			`SKIP_ENV_VALIDATION in .env to route sign-in through this server.\n`,
	),
);

serve({ fetch: app.fetch, port: PORT }, ({ port }) => {
	console.log(`[auth-dev] listening on http://localhost:${port}`);
});
