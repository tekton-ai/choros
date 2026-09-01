---
artifact: spec
feature: rebrand
author: Claude (opus-4.7-1m via omp harness), on behalf of XXLOKI
status: draft
created: 2026-09-01
intent: ./intent.md
---

# Spec — Retire "Superset", ship as "Choros"

_Prerequisite: `intent.md` in this folder is `status: accepted`._

## Requirements & design spec

### Functional requirements

Grouped by surface. Each item is an observable "done" criterion, not an implementation step.

**Product identity**
- The user-visible product name is `Choros` everywhere the shipping app renders it: window titles, About dialog, menus, splash, tray, notifications, marketing hero, docs, MCP `server-card`, Slack integration copy, admin dashboard header, Discord triage bot messages, mobile launcher label.
- The i18n glossary (`packages/i18n/glossary.md`) has `Superset` removed from the never-translate list and `Choros` added. Every locale in `SUPPORTED_LOCALES` has its `messages.po` entries containing `Superset` replaced. `bun run --cwd packages/i18n check` and `compile --strict` pass with no half-translated messages.

**CLI**
- The published CLI binary is named `choros` (`choros.exe` on Windows, `choros.cmd` shim on Windows). No `superset` binary or alias ships. Bundled inside the desktop app at `dist/resources/bin/choros`.
- `choros --help`, subcommand names, and error messages contain no "Superset" references.
- The CLI's self-install / shim writer refuses to overwrite an unmanaged file at the target path — same policy as today's `bundled-cli.ts`.

**Desktop app**
- Electron `appId` = `com.choros.desktop` (canary: `com.choros.desktop.canary`). `productName` = `Choros`.
- Custom URL scheme `choros://` replaces `superset://`. Deep links from marketing / docs / auth callbacks are updated to the new scheme.
- Auto-update feed points at the new GitHub release feed (new org, decided below). Old feed continues to serve one final version whose only job is to display a "we're now Choros, please install here" screen with a one-click migration action.
- **Migration flow (new UX):** first launch of `Choros.app` on a machine with `Superset.app` installed detects the old app's data directory, prompts the user to migrate (single dialog: "We renamed. Import your workspaces, settings, and credentials?"), and on accept copies workspaces / settings / local DB. Keychain entries are re-created in the new bundle's keychain namespace with an inline "re-authorize" step (the user re-enters passphrases; we do not attempt to read the old bundle's keychain because macOS ACLs make that inconsistent and risky). Old app is then archived (not deleted) with a link to uninstall.

**Mobile app**
- iOS bundle id changes to `com.choros.mobile`. Because App Store treats this as a new app, old app is deprecated (last version shows a "we're now Choros" screen with a store link), new app is submitted fresh. Data migration is out of scope for mobile (mobile is thin — no local user data of consequence per `apps/mobile/AGENTS.md`).

**Packages / npm**
- Every published package is republished under `@choros/*`. Package names in each `package.json`, all inter-package imports, `tsconfig` paths / references, and dependency declarations reference the new scope.
- Each `@superset/*` package receives one final version marked `deprecated` with the message: `"Superset was renamed to Choros. Install @choros/<same-name> instead."` The version bump is a patch. Old versions in registry remain (npm policy) — that's fine, they still work; only `npm install @superset/foo` shows the deprecation banner.

**GitHub**
- Repo lives at a new org (name decided per Concerns). Old repo redirects (GitHub 301) but README shows: "This repo is archived. We're now at github.com/<new-org>/choros." All internal external links (marketing, docs, CI badges) point at the new URL.
- `packages/shared/src/constants.ts` `GITHUB_REPO` constant switches to the new owner/name.

**Domains**
- New root domain hosts marketing, docs, api, app subdomains. Old root domain is taken offline (per intent constraint — no 301 hold). Email suffix changes; existing employee mail is forwarded transitionally then cut.

**Internal identifiers**
- Symbol renames applied everywhere: `Superset*` types, classes, variables, modules, directory names → `Choros*`. Includes but not limited to `SUPERSET_PRODUCT_NAME` constant, `createSupersetMcpClient` / `cleanupSuperset` / `supersetMcp` in `apps/api/integrations/slack/events/utils/run-agent/`, `SUPERSET_AGENT` in `apps/desktop/src/renderer/hooks/useV2AgentChoices/useV2AgentChoices.ts`.
- The `BuiltinAgentId` string literal `"superset"` in `packages/shared/src/builtin-terminal-agents.ts` becomes `"choros"`. This is a **breaking data change**: any persisted `HostAgentPreset.presetId === "superset"` in local DBs must be migrated at desktop startup — a one-shot lookup that rewrites `"superset" → "choros"` in the local settings store.
- Icon key `"superset"` in `PRESET_ICONS` becomes `"choros"` (rename asset file too).
- `agents.md` / `.agents/skills/**/*.md` string replacements. `AGENTS.md` orchestration commands are rewritten to use `choros` binary.

**Test suite adjustments (contract-preserving, not new tests)**
- `apps/desktop/src/main/lib/update-error-classification.test.ts` and `update-error-redaction.test.ts` contain hardcoded `com.superset.desktop.ShipIt` cache paths in their redaction fixtures. These are the actual observable contract the redaction function must handle — they change to `com.choros.desktop.ShipIt`. **The redaction function itself must additionally still recognize the old bundle id for one release cycle**, because in-flight update errors on machines that just upgraded will still reference the old path. This is a real backward-compat surface, not a test-only concern.

### Non-functional requirements

- **User data continuity (desktop):** zero data loss for any user who launches Choros.app once with Superset.app present. Migration is atomic (copy then verify; original stays until verified) so a mid-copy crash leaves the old app fully functional.
- **Update pipeline continuity:** the last Superset release must reliably reach every existing user via the old auto-update feed. Delivery success rate ≥ current baseline (measured 7 days post-cutover).
- **CI green throughout:** repo rename must not break CI. GitHub Actions workflows, secrets, and repo-name-derived references audited pre-cutover.
- **No performance regression:** rename is textual + config; no runtime code path changes. Benchmarks (startup time, MCP response time) within 1σ of pre-cutover.
- **Deep link continuity for one release:** the old `superset://` URL scheme remains registered (bound to a redirector that opens the new app with the equivalent `choros://` URL) for one release cycle after cutover, so bookmarked links keep working while users update the source of the link.

### Out of scope

- Rewriting git history / previously published npm tarballs / archived desktop installers. (Intent constraint.)
- Migrating mobile local data. (Mobile is thin.)
- Renaming external services we integrate with (Slack app name, Linear connection label, Sentry integration name are covered — but the vendor apps themselves are not our surface).
- Adding new features under the guise of the rebrand.
- User-facing "why did you rename?" content — a link to a short blog post is enough; a full FAQ is not required.
- Making the CLI back-compat friendly with `superset` alias. (Intent decided against.)
- Long-tail `Superset` mentions in `plans/*.md` historical planning docs. Those are frozen artifacts of past work; we leave them.

## Integration with existing code

Representative hotspots (not exhaustive — the plan will enumerate). Each named file is a real reference the spec anchors against:

**Bundle id, product name, URL scheme, release feed**
- `apps/desktop/electron-builder.ts` (`appId`, `productName`, `schemes`, `publish.{owner,repo}`)
- `apps/desktop/electron-builder.canary.ts` (same, canary suffix)
- `apps/desktop/scripts/patch-dev-protocol.ts` — `PROTOCOL_SCHEME`, `BUNDLE_ID` templates driven by workspace name; adjust the base string.

**CLI binary**
- `apps/desktop/scripts/build-bundled-cli.ts` — hardcoded `superset` / `superset.exe`.
- `apps/desktop/src/main/lib/bundled-cli.ts` — `getBundledCliBinaryName` / `getBundledCliShimName` returning `superset` on non-Windows, `superset.exe|.cmd` on Windows.
- `apps/desktop/src/main/lib/bundled-cli.test.ts` — asserts the binary names above.
- `packages/cli/` — package name change (`@superset/cli` → `@choros/cli`), any embedded product-name strings in help output.

**Shared constants**
- `packages/shared/src/constants.ts` — `GITHUB_REPO = { OWNER, NAME, URL }` referenced by star-nag / issue-report / update-feed lookups.
- `packages/shared/src/builtin-terminal-agents.ts` — `BUILTIN_TERMINAL_AGENTS` array containing `"superset"` as a `BuiltinAgentId`.
- `packages/shared/src/agent-catalog.ts` — `BuiltinAgentId` type union.
- `packages/shared/src/host-agent-presets.ts` — `HostAgentPreset.presetId` values.
- `packages/ui/src/assets/icons/preset-icons/index.ts` — `PRESET_ICONS` map keyed by preset id (rename key + asset).

**MCP / API surface**
- `apps/api/src/app/.well-known/mcp/route.ts` and `apps/api/src/app/.well-known/mcp/server-card.json/route.ts` — MCP server metadata (name, title, description, icon URL, auth doc URL).
- `apps/api/src/app/.well-known/oauth-protected-resource/route.ts` and `[...path]/route.ts` — `resourceName`, `resourceDocumentation`.

**Slack / marketing / admin copy**
- `apps/api/integrations/slack/events/process-app-home-opened/build-home-view.ts` — home tab welcome copy, "Open Superset" button.
- `apps/api/integrations/slack/events/utils/run-agent/run-agent.ts` — `SYSTEM_PROMPT`, `createSupersetMcpClient`.
- `apps/api/integrations/slack/events/utils/work-objects/work-objects.ts` — `SUPERSET_PRODUCT_NAME` constant, "Open in Superset" action.
- `apps/marketing/src/app/[lang]/components/HeroSection/HeroSection.tsx` — hero copy is behind Lingui IDs like `marketing.hero.headlineLead` / `marketing.hero.subheadline`; IDs stay stable (per repo i18n rules), catalog text changes.
- `apps/admin/src/app/layout.tsx` and `apps/admin/src/app/(dashboard)/layout.tsx` — metadata `title`, breadcrumb label, sidebar header logo alt text.

**Update pipeline compatibility surface**
- `apps/desktop/src/main/lib/update-error-classification.ts` and `update-error-redaction.ts` — the classifier / redactor must recognize both `com.superset.desktop.ShipIt` and `com.choros.desktop.ShipIt` cache paths for one release cycle. Test fixtures in the co-located `.test.ts` files anchor both.

**Desktop UI enum**
- `apps/desktop/src/renderer/hooks/useV2AgentChoices/useV2AgentChoices.ts` — `SUPERSET_AGENT` constant (`id`, `label`, `iconId` all `"superset"`).
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/page.tsx` — string filter `a.id !== "superset"`.

**Docs and agent guidance**
- `AGENTS.md` — the "Orchestrating agents and workspaces" block uses `superset` CLI in every example. Full rewrite.
- `.agents/skills/**/*.md` — sweep.
- `apps/desktop/AGENTS.md`, `apps/mobile/AGENTS.md`, other `AGENTS.md` files — sweep.

**i18n glossary**
- `packages/i18n/glossary.md` — remove `Superset`, add `Choros`.
- `packages/i18n/src/locales.ts` — `SUPPORTED_LOCALES` unchanged; catalog contents change per-locale.
- `packages/i18n/test/enforced-dirs.ts` — verify enforcement still holds after mass string edits.

**Cross-cutting new abstraction**
- **One added file** justified: `apps/desktop/src/main/migration/legacyRebrand/` (or equivalent) hosts the first-launch legacy-data-import logic. Justification: this is a one-shot upgrade path with distinct concerns (path detection, atomic copy, keychain re-authorization prompt); nothing existing owns it. Slated for removal two releases after cutover — its deletion is part of the plan.

## Policy compliance

### Brand
No brand policy skill or `docs/policies/brand.md` detected in this repo. **Manual confirmation required from product / marketing owner** on: (a) the "Choros" wordmark and its typography treatment, (b) the transition messaging shown in the final Superset release and in the migration dialog, (c) whether the Discord / X / other social handles are also in scope. See `Areas of concern`.

### Security
- **Bundle id change is a security-adjacent event**: macOS keychain items scoped to `com.superset.desktop` are not readable by `com.choros.desktop`. We do not attempt to bypass this. Instead the migration flow asks the user to re-authorize, which is auditable and does not require a code-signing chain claim about the old bundle.
- **Auto-update feed cutover is supply-chain-critical**: the last release from the old feed instructs users to install from the new domain. That last release **must be signed by the existing signing chain** and must not silently switch update sources — silent update-source rotation is a well-known malware pattern and would break user expectations. The user must click through the "install Choros" flow explicitly.
- **URL scheme handover:** registering `choros://` is fine; keeping `superset://` registered for one release cycle (per NFR) is bounded. It must forward to the equivalent `choros://` deep link without side effects.
- No changes to authN/authZ, session storage semantics, or secrets management beyond keychain namespace rename.

No security-review skill detected in this repo. **Manual confirmation required from security owner** on the two starred items above.

### Compliance
- The change is **legally driven** — trademark conflict is the sole reason for this work. Legal is in the loop by definition.
- No PII, PCI, GDPR, or SOC2 scope shifts. No data-processor changes. No cross-border data movement.
- Data-processing agreements referencing "Superset" as the data processor must be re-papered by legal in parallel with technical rollout. Not agent-actionable but tracked here for visibility.

No compliance skill detected. **Manual confirmation required from legal owner** on: DPA / subprocessor list updates, trademark search for `Choros` in target jurisdictions before ship, and the hard deadline (still open).

### UX
- Migration dialog on first launch is the entire user-facing UX contract. It must be: (a) modal but not blocking (user can dismiss and migrate later from a "welcome back" card in the sidebar), (b) reversible (choosing "skip" does not delete the old app or its data), (c) clear on scope ("workspaces, settings, saved credentials will be re-imported; you'll be asked to unlock keychain again").
- Accessibility: dialog follows existing `Dialog` primitive contract (keyboard trap, ESC to dismiss, focus return). Copy pitched at 8th-grade reading level.
- No changes to any existing interaction pattern beyond the migration surface.

No frontend-design or UX skill loaded automatically. Repo's `.agents/skills/frontend-design` is available on request. **Manual confirmation from UX owner** on the migration dialog copy + interaction is recommended, not blocking.

## Areas of concern

- **Trademark search for "Choros" not yet performed** (owner: legal). This spec cannot be safely accepted until legal confirms `Choros` is available in target jurisdictions. If it isn't, we re-run the naming step in the intent, not just the spec. This is the single largest risk item.
- **Hard deadline still unset** (owner: product owner ↔ legal). "尽快" needs a date. The date changes the release strategy (big-bang if tight; staged if there's runway). Everything downstream — plan sequencing, comms schedule — depends on it.
- **GitHub org name undecided** (owner: product owner). `Choros` is a dormant 2014 org with no contact info. Options: (a) file dormant-account claim (weeks-to-months, no guarantee), (b) accept a suffix (`choros-labs`, `getchoros`, `usechoros`). Recommendation: pick a suffix now, keep the dormant-account claim as an async improvement.
- **Domain root undecided** (owner: product owner ↔ legal). `choros.dev` / `choros.ai` / `choros.com` all need proper whois + trademark disambiguation before purchase. Recommendation: legal shortlists two, product owner picks.
- **Keychain re-authorization is a friction point** (owner: security + UX). Users with many saved credentials will feel this. Consider whether an in-product credential export → import path (encrypted archive user carries between apps) is worth building; today's plan says no.
- **Users who never migrate lose access to old data eventually** (owner: product owner). If we deprecate the old app aggressively, users on stale versions will be stranded. Recommendation: last Superset release stays reachable via a stable download URL indefinitely, but stops receiving updates.
- **`BuiltinAgentId` string literal is a data-migration boundary** (owner: engineering). Persisted values `"superset"` in local settings DBs must be rewritten to `"choros"` at first launch of the new app. Missing this leaves users' agent preset settings silently reset. Plan-stage detail, flagged here so it isn't lost.
- **Update-error redaction dual-path fixture** (owner: engineering). The redactor recognizing both `com.superset.desktop.ShipIt` and `com.choros.desktop.ShipIt` for one release cycle is a stated backward-compat surface. Removal of the old path must be scheduled (plan: two releases post-cutover) and tracked, or it becomes rot.
- **Marketing social account handles** (owner: product / marketing). Intent didn't explicitly include them; spec assumes yes because "彻底消失" implies it. Needs explicit product-owner confirmation.
- **External integrations named "Superset" on vendor side** (owner: product + each vendor's ops). Slack app name, Linear connection display name, Sentry integration display name, GitHub App name — each is a vendor-console rename with its own workflow. Coordination required; not code-only.
- **Cross-repo forks / community PRs in flight** (owner: engineering). Any external contributor with a fork of `superset-sh/superset` sees the rename as a discontinuity. Publish a redirect notice and, if practical, a script that helps contributors re-point their remotes.
- **No brand / security / compliance / UX skills detected in this repo**. Every "manual confirmation required" line above is a real audit gap that a fresh spec run would silently pass. Flagging so the product owner routes each explicitly.

## Author + Status

- **Author:** Claude (opus-4.7-1m via omp harness), on behalf of XXLOKI
- **Status:** `draft` — flip to `accepted` when the product owner accepts this artifact with flagged concerns dispatched
