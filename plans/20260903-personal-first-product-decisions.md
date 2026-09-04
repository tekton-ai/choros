# Personal-first product decision log

Source spec: `docs/sdlc/personal-first-product-scope/spec.md`
Status: complete

| # | Decision | Choice | Consequence |
|---|---|---|---|
| 1 | Account and login boundary | Keep personal login only | Remove collaboration and organization UX, but retain an authentication service. This materially changes the accepted intent, which must be revised and re-accepted before the spec can be accepted. |
| 2 | Login method | GitHub and Google OAuth | Retain two OAuth providers and account-linking behavior; email/password and transactional-email login are not required. |
| 3 | Online service boundary | Authentication and usage statistics only | Retire every other Choros cloud capability and prevent a general-purpose API from surviving without a named requirement. |
| 4 | Server-side ownership model | Store authentication records only | No organization or generic server-side product ownership model; OAuth accounts/sessions and usage facts are the only persisted server records. |
| 5 | Task product surface | Keep repository issues only | Remove proprietary cloud Task CRUD, statuses, assignees, board, Linear/QStash sync, and task UUID links; retain host-local GitHub Issue/PR to Workspace/Agent flows. |
| 6 | Automation product surface | Remove Automation | Delete cloud automation definitions, schedules, event/webhook triggers, prompt versions, run history, and UI; retain ordinary manually started agent sessions. |
| 7 | Remote and cloud workspaces | Remove all | Delete relay, remote host registry, presence, cloud workspaces, multi-device access, and their paywall/UI; retain only the current machine's local host service. |
| 8 | Chat and agent history | Local history only | Preserve local chat/session persistence in chat-runtime/host-service; remove cloud chat metadata, upload, and cross-device sync. |
| 9 | Update information | Retain latest-version delivery | The product must publish the latest supported version and let desktop clients discover it; database-backed rich notices are removed. |
| 10 | Version delivery shape | Static version manifest | Release automation publishes a read-only manifest with latest/minimum supported version and release/download URL; remove the database-backed rich notice system. |
| 11 | Crash reporting | Keep Sentry code, disabled | Retain Sentry integration points but ship without a DSN; remove/rotate any inherited Superset destination before future enablement. PostHog exception capture stays off. |
| 12 | Usage data model | Store basic raw usage events | Persist only event ID, user ID, event name, occurred-at timestamp, app version, platform, and schema version; derive DAU and later analyses in queries, with no arbitrary properties JSON. |
| 13 | Legacy cloud product data | Delete after proving empty | Remove legacy product schemas and infrastructure once production row counts confirm there is no data; if any row exists, stop and return for an explicit retention decision before destructive deletion. |
| 14 | CLI boundary | Local CLI only | Retain local workspace/agent scripting and orchestration; remove organization, member, remote host, cloud automation, and other cloud-product commands. |
| 15 | Usage ingestion | Store in authentication service | Add one narrow authenticated usage endpoint and basic event table beside auth; remove PostHog product analytics and avoid a general-purpose tRPC API. |
| 16 | Usage events | `desktop_opened` only | Send one event after authenticated app startup; calculate DAU by distinct user ID per UTC day, with no workspace, agent, heartbeat, page, or feature events. |
| 17 | Offline authentication behavior | Allow offline use after login | A securely cached prior identity unlocks local features while offline; refresh the session and send usage only after connectivity returns. First login still requires network. |
| 18 | Sign-out data behavior | Preserve all local data | Sign-out revokes/clears authentication only; local projects, workspaces, chat history, credentials, and settings remain untouched. |
| 19 | Local account isolation | One machine-local profile | Local product data is independent of the signed-in account; switching OAuth accounts does not switch or hide local projects, workspaces, chat, or settings. |
| 20 | Billing and paywall | Remove all | Delete Stripe, subscriptions, plans, seats, paywall UI, feature gating, billing webhooks, and related admin metrics/secrets. |
| 21 | Third-party business integrations | Remove all server integrations | Delete Slack, Linear, Teams, Google workspace, GitHub App installation, provider tokens, sync jobs, and webhooks; retain GitHub/Google solely as login providers and local `gh` access. |
| 22 | Usage reporting | Query the database directly | Do not build an admin API or dashboard; the owner derives DAU and later analyses with direct read-only database queries. |
| 23 | Usage event retention | One year | Automatically delete raw usage events older than 365 days; no permanent person profile or indefinite per-user activity history. |
| 24 | Account deletion | No self-service deletion | Users can sign out and revoke provider access, but the product does not initially expose account deletion. This requires explicit Privacy/Legal review before production acceptance. |
| 25 | Signup policy | Public OAuth signup | Any GitHub or Google user may create a personal account; remove invites, allowlists, organization creation, and transactional signup email dependencies. |
| 26 | OAuth account linking | Keep current implicit linking | Better Auth links GitHub/Google identities only when the provider verifies the same email; different or unverified emails remain separate accounts. No manual linking UI is added. |
| 27 | Update behavior | Notify, never block | Show a new-version notice and update entry point; manifest failure or an old client version never blocks local use. |
| 28 | Legacy local organization data | No migration required | The product has not shipped and has no user organization profiles; remove the organization-shaped local model directly instead of building merge or compatibility logic. |
| 29 | Development data migration | Reset all development databases | Rebuild local/cloud development schemas from scratch and discard test/manual rows; never delete the user's Git repositories or files on disk. |
| 30 | First-run onboarding | Streamlined local onboarding | After OAuth login, guide model credential setup and opening/creating the first local project; write no cloud product state. |
| 31 | Repository issue/PR entry point | Place inside each Project | Remove the global Tasks surface; show repository Issues/PRs in project context and launch Workspace/Agent from there. |
| 32 | Account settings UI | Identity and sign-out only | Show current provider, email/avatar, and sign-out; remove profile mutation, avatar upload, account deletion, organization, billing, API key, and integration settings. |
| 33 | Version manifest fields | Minimal version information | Publish only schema version, latest version, published-at, and release URL; no minimum-version policy or rich changelog payload. |
| 34 | `desktop_opened` frequency | Every successful app start | Store one idempotent event for each successful authenticated/local-offline startup; DAU queries deduplicate by user and date while raw data preserves launch frequency. |
| 35 | High-risk approval roles | Owner accepts all roles | The user explicitly accepts the spec as Product Owner, Tech lead/AppSec, and Privacy/Legal, including OAuth, telemetry retention, no self-service deletion, and development schema reset risks. |
| 36 | Auth and usage database | Keep Neon Postgres | Reuse existing Better Auth/Drizzle/Neon infrastructure and direct SQL access; remove unrelated schemas instead of migrating auth to D1. |
| 37 | Usage retention enforcement | Defer cleanup implementation | Keep the one-year retention intent documented, but do not build the scheduled deletion in this implementation; the spec must be amended and this privacy debt remains explicit. |
| 38 | Usage write path | App-open call to narrow Hono route | On each successful app start, desktop calls the auth Worker, which derives the user from the session and inserts the basic event into Neon; the owner later reads Neon directly. Desktop never receives database credentials. |
| 39 | Local host-service identity | True singleton with no ID | Remove organization parameters, multi-instance maps, and org-keyed paths; use one machine-local host-service/daemon namespace. |
| 40 | Local product data authority | Host-service SQLite | Store project/workspace/terminal/agent/PR business state in the host DB; keep desktop local-db only for genuinely desktop-scoped preferences/history and remove dual-write/migration layers. |
| 41 | Implementation sequence | Vertical slices, delete last | Add minimal auth/usage and singleton host foundations, switch desktop/CLI consumers, then delete old cloud routers, schemas, dependencies, and deployment config. |
| 42 | Delivery shape | Sequential staged PRs | Deliver dependent, individually verifiable PRs for usage/auth, singleton host, desktop cutover, CLI/release, and final cloud deletion; no long-lived compatibility layer remains at the end. |
| 43 | Verification depth | Real flows plus automated tests | Use contract/integration tests per PR and final real desktop CDP, dev OAuth, network capture, and synthetic Git-data safety smoke before completion. |
| 44 | Additional blocking risks | Existing risk list is sufficient | Proceed with the documented OAuth, offline, usage, host, database, Git safety, release, Sentry, and destructive-migration gates. |
| 45 | Implementation plan approval | Accepted | Proceed with five sequential PRs, real-flow verification, no compatibility layer, and the documented high-risk gates. |
