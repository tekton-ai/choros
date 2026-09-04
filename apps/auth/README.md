# @choros/auth-server

Cloudflare Workers deployment of the Choros auth broker. One instance serves
every environment — local dev, staging, prod — routed by the `protocol` query
param each desktop passes at sign-in kickoff (`choros-<worktree>://` for dev,
`choros://` for prod).

Same code shape as the local dev script (`scripts/auth-dev-server.ts`), with
`node:crypto` swapped for Web Crypto and the Hono `serve()` replaced by the
Workers fetch export. If you're just doing local hacking on the auth server
itself, run the dev script instead — it's the same behaviour with faster
iteration.

## What you need before deploying

1. A Cloudflare account (free tier is enough).
2. `wrangler` CLI: `bun install -g wrangler`, then `wrangler login`.
3. A running Neon Postgres — you already have one wired into the repo's
   `.env` for local dev; production wants a separate branch/project.
4. An Upstash Redis with the HTTP REST API enabled (used for rate-limit and
   invite magic-tokens).
5. GitHub OAuth App — see below.
6. Google Cloud OAuth 2.0 Client — see below.

## Step 1 — pick your public URL

Two options:

**Free workers.dev subdomain** (fastest to try):

```
https://choros-auth.<your-cf-account>.workers.dev
```

You get this the first time you `wrangler deploy` — Cloudflare tells you the
URL. Edit `wrangler.toml`'s `AUTH_SELF_URL` to match (the OAuth `callbackURL`
we hand to GitHub/Google is built from this — it MUST match the URL the
browser actually reaches this Worker at).

**Custom domain** (recommended for prod):

Add your zone to Cloudflare, point it at the Worker with a Custom Domain in
the dashboard, and set:

```toml
routes = [{ pattern = "auth.choros.sh", custom_domain = true }]

[vars]
AUTH_SELF_URL = "https://auth.choros.sh"
```

## Step 2 — GitHub OAuth App

<https://github.com/settings/applications/new> (personal) or your org's
Developer settings (recommended for prod):

- Application name: `Choros`
- Homepage URL: `https://choros.sh` (or wherever your marketing site lives)
- Authorization callback URL: `${AUTH_SELF_URL}/api/auth/callback/github`

Register → copy Client ID → generate Client Secret. Same App can serve dev
and prod because the desktop's `protocol` param decides which Electron scheme
gets the token back at the end.

**Caveat**: sharing the App means a single Client Secret leak affects every
environment. If that's not okay, register a second App with a different
callback URL for local dev.

## Step 3 — Google Cloud OAuth Client

<https://console.cloud.google.com/apis/credentials> → Create Credentials →
OAuth Client ID → Web application:

- Authorized redirect URI: `${AUTH_SELF_URL}/api/auth/callback/google`

Copy Client ID and Secret.

## Step 4 — set the secrets

From `apps/auth/`:

```bash
wrangler secret put GH_CLIENT_ID
wrangler secret put GH_CLIENT_SECRET
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET

# 32+ random bytes; better-auth signs cookies and JWTs with this.
# Rotate ⇒ every session is invalidated.
wrangler secret put BETTER_AUTH_SECRET   # openssl rand -base64 32

# Neon Postgres — the production URL, NOT your local dev DB.
wrangler secret put DATABASE_URL

# Upstash Redis HTTP.
wrangler secret put KV_REST_API_URL
wrangler secret put KV_REST_API_TOKEN

# Resend for transactional email. Sign-up welcome / org invites go through
# this; the auth server won't boot cleanly without one.
wrangler secret put RESEND_API_KEY

# Stripe — only needed if you actually run billing. Fake keys work for now
# because packages/auth/src/server.ts's Stripe plugin lazy-inits.
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
```

Verify what's set: `wrangler secret list`.

## Step 5 — deploy

```bash
cd apps/auth
wrangler deploy
```

The first deploy prints your Worker URL. Copy it into `wrangler.toml`'s
`AUTH_SELF_URL`, re-run `wrangler deploy` so the value reaches the runtime,
and update the OAuth Apps' callback URLs to match.

## Step 6 — smoke test

```bash
# Should return the endpoint list.
curl https://choros-auth.<your-account>.workers.dev/

# Should 302 to https://github.com/login/oauth/authorize?...
curl -I 'https://choros-auth.<your-account>.workers.dev/api/auth/desktop/connect?provider=github&state=x&protocol=choros'

# Same for Google.
curl -I '.../api/auth/desktop/connect?provider=google&state=x&protocol=choros'

# With a desktop bearer session, a valid event should return 204.
# The server derives userId from the session; never put userId in the body.
curl -i -X POST 'https://choros-auth.<your-account>.workers.dev/api/usage/events' \
  -H 'Authorization: Bearer <desktop-session-token>' \
  -H 'Content-Type: application/json' \
  --data '{"id":"01991f5d-6ad0-7f62-a5f1-2cb897cc78ba","event":"desktop_opened","occurredAt":"2026-09-03T08:00:00.000Z","appVersion":"0.1.0","platform":"darwin-arm64","schemaVersion":1}'

# Supplying userId or any other unknown field should return 400.
```

## Step 7 — point desktop at it

Every desktop `.env` (dev worktrees included):

```
NEXT_PUBLIC_API_URL=https://choros-auth.<your-account>.workers.dev
# or your custom domain
```

Remove/comment `SKIP_ENV_VALIDATION=1` if you want the sign-in page to
actually route through this server instead of the mock-session bypass. The
GitHub / Google buttons will now walk the full flow.

## Local iteration

`wrangler dev` runs the same Worker locally on `http://localhost:8787`. If
you want to test against a shape closer to production without deploying,
this is the fastest loop — just remember to also change `NEXT_PUBLIC_API_URL`
in the desktop's `.env` to `http://localhost:8787`.

Prefer plain Bun/Node for iteration on the shared parts? `bun run auth:dev`
at the repo root runs `scripts/auth-dev-server.ts` — same behaviour, no
Workers-specific bits, direct stack traces.

## Observability

`wrangler.toml` has `[observability] enabled = true`. Look at the last 3
days of requests + errors in the Cloudflare dashboard under Workers →
choros-auth → Logs. For a live tail while reproducing something:

```bash
wrangler tail
```
