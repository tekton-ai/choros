---
artifact: spec
feature: rebrand
author: Claude (opus-4.7-1m via omp harness), on behalf of XXLOKI
status: draft
created: 2026-09-01
revised: 2026-09-01
intent: ./intent.md
---

# Spec — Retire "Superset" in the tekton-ai fork, ship as "Choros"

_Prerequisite: `intent.md` in this folder is `status: accepted` (with the 2026-09-01 scope clarification note)._

## Context (why this spec is much smaller than the first draft)

The first draft of this spec assumed corporate-Superset ownership. Follow-up scoping established that this repo is a personal fork (`tekton-ai/superset`) that builds locally for the author's own use — no release pipeline, no npm publishing, no vendor consoles, no external users, no App Store presence. Whole categories of concern collapse:

| Prior concern | Fork-scoped status |
|---|---|
| Auto-update feed cutover | **N/A** — author does not publish releases |
| npm `@superset/*` deprecation flow | **N/A** — author does not publish to registry |
| Vendor integrations (Slack/Linear/Sentry/GitHub App console names) | **N/A** — those accounts belong to upstream |
| Mobile App Store re-submission | **N/A** — not the author's account |
| Desktop first-launch migration UX for other users | **N/A** — the author is the only user |
| Keychain re-authorization UX | **Simplified** — author re-authorizes their own machine once |
| `BuiltinAgentId="superset"` persisted-data migration | **Trivial** — a one-shot local rewrite for the author's own DB, or a wipe |
| `update-error-redaction` bundle-id dual-path back-compat | **N/A** — no update pipeline; test fixtures still change to match new bundle id |
| Cross-repo forks / community PRs | **N/A** — no downstream community |
| GitHub org acquisition (dormant `Choros`) | **N/A** — using `tekton-ai/choros` via repo rename |
| `superset.sh` domain policy | **N/A** — upstream property |

What remains: source-tree hygiene. Renaming strings and constants in files the author actually owns.

## Requirements & design spec

### Functional requirements

**Repo & remote**
- Repo renamed on GitHub: `tekton-ai/superset` → `tekton-ai/choros`. GitHub 301 handles old URLs. Local remote updated: `git remote set-url origin git@github.com:tekton-ai/choros.git`.

**Source tree**
- No occurrence of `Superset` (case-insensitive, whole-word) in `apps/**`, `packages/**`, `scripts/**`, or root config files — with two documented exemption categories:
  1. Historical planning documents in `plans/**` and `docs/plans/**` (frozen artifacts of prior work).
  2. Files under `docs/sdlc/rebrand/` themselves — this SDLC audit trail names the old brand deliberately.
- No occurrence of `superset` (lowercase, word-boundary) in the same tree with the same two exemptions. Path fragments like `/Users/foo/projects/superset/` in test fixtures are updated to `.../choros/` (they represent the author's own worktree path).
- All `Superset*` PascalCase identifiers renamed to `Choros*` (types, classes, module names, directory names). Camel/snake forms follow: `SUPERSET_PRODUCT_NAME` → `CHOROS_PRODUCT_NAME`, `createSupersetMcpClient` → `createChorosMcpClient`, etc.
- All `@superset/*` package references in `package.json` files, `import` statements, `tsconfig.json` `paths` and `references`, and any `bunfig.toml` / `turbo.json` filters point at `@choros/*`.
- URL scheme `superset://` → `choros://`. Custom protocol registered in `electron-builder.ts`, all deep-link generators, and every consumer.

**Build config**
- `apps/desktop/electron-builder.ts`: `appId` = `com.choros.desktop`, `productName` = `Choros`, `schemes: ["choros"]`, `publish.owner` = `tekton-ai`, `publish.repo` = `choros`.
- `apps/desktop/electron-builder.canary.ts`: `appId` = `com.choros.desktop.canary`, same publish owner/repo.
- `apps/desktop/scripts/patch-dev-protocol.ts`: `PROTOCOL_SCHEME` and `BUNDLE_ID` template base strings switch.
- `apps/desktop/scripts/build-bundled-cli.ts` and `apps/desktop/src/main/lib/bundled-cli.ts`: binary name `superset` / `.exe` / `.cmd` → `choros` / `.exe` / `.cmd`.

**Runtime constants**
- `packages/shared/src/constants.ts`: `GITHUB_REPO = { OWNER: "tekton-ai", NAME: "choros", URL: "https://github.com/tekton-ai/choros" }`.
- `packages/shared/src/builtin-terminal-agents.ts`: `"superset"` literal → `"choros"`.
- `packages/shared/src/agent-catalog.ts`: `BuiltinAgentId` union member `"superset"` → `"choros"`.
- `packages/ui/src/assets/icons/preset-icons/index.ts`: `PRESET_ICONS` key `superset` → `choros` (asset file renamed too).
- `apps/desktop/src/renderer/hooks/useV2AgentChoices/useV2AgentChoices.ts`: `SUPERSET_AGENT` constant → `CHOROS_AGENT`, `id`/`label`/`iconId` all `"choros"` / `"Choros"`.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/page.tsx`: string filter `a.id !== "superset"` → `"choros"`.
- `apps/api/integrations/slack/events/utils/work-objects/work-objects.ts`: `SUPERSET_PRODUCT_NAME` → `CHOROS_PRODUCT_NAME` = `"Choros"`.

**i18n**
- `packages/i18n/glossary.md`: remove `Superset`, add `Choros` to never-translate list.
- Every `messages.po` under `packages/i18n/locales/*` and `apps/*/locales/*`: replace `Superset` → `Choros` in message text. IDs unchanged (repo rule: IDs are stable).
- `bun run --cwd packages/i18n check` and Lingui `compile --strict` pass.
- No half-translated messages introduced (the strict compiler enforces).

**Docs**
- `AGENTS.md` at repo root: all `superset` CLI examples become `choros`; product-name references become `Choros`.
- `apps/*/AGENTS.md`, `packages/*/AGENTS.md` if present.
- `.agents/skills/**/*.md`: sweep for product name and CLI references.
- `README.md` (if any names Superset): update.
- `docs/**` (excluding `docs/sdlc/rebrand/` and `docs/plans/`): update.


**Landing page (new, GH Pages)**
- A minimal static landing page lives at `docs/site/` and is served via GitHub Pages from `tekton-ai/choros` (default URL: `tekton-ai.github.io/choros`; no custom domain, no DNS setup).
- Content: one page — Choros name + one-line tagline (adapted from the fork's `HeroSection` copy), a screenshot or two, a link to the GitHub repo, a link to whichever release/download surface the author later chooses (placeholder `#` acceptable until then).
- Implementation: a single `index.html` (plus one CSS file if needed). No framework, no build step, no i18n. Explicitly NOT a port of `apps/marketing/`.
- GH Pages source: the `docs/site/` directory on the default branch (configured in repo settings post-rename). No `gh-pages` branch, no submodules.

**`apps/marketing/` handling**
- Left in the source tree structurally unchanged; not deployed by this fork. Its i18n catalog entries and hero copy references to `Superset` still get renamed to `Choros` as part of the general string sweep so the code compiles and typechecks cleanly, but no next.config, deployment target, or SSR feature is modified.

**Author's own machine (one-time manual)**
- Rebuild desktop app with new bundle id. Old `Superset.app` continues to work locally with old bundle id; author drags to Trash after confirming new build runs.
- Author re-enters any credentials the app persisted in Keychain (one-off; no code needed).
- Local settings DB entries with `presetId === "superset"` — author either wipes local settings and re-onboards, or the new build ships a one-time startup migration reading `presetId === "superset"` and writing `"choros"`. Recommendation: **wipe** — cheaper than writing migration code for a single-user data set.

### Non-functional requirements

- **CI green throughout.** Repo rename must not break GitHub Actions. Any workflow referencing `superset-sh/superset` (via checkout of a specific ref or hardcoded URL) audited pre-rename. Local dev scripts likewise.
- **No performance regression.** Rename is text + config; runtime behavior unchanged. Existing benchmarks (if any) within 1σ.
- **Test suite passes** after rename. Fixtures containing `com.superset.desktop.ShipIt` cache paths, `superset-sh` repo owners, `"superset"` presetId literals, or hardcoded worktree paths (`/Users/.../superset/`) are updated to the new brand — these ARE the observable contract for redaction/classification code that reads bundle-id-shaped paths.

### Out of scope

- Rewriting git history / rewriting prior commit messages / force-pushing.
- Anything on `superset-sh` upstream (domains, npm scope, vendor consoles, App Store, docs.superset.sh).
- Publishing `@choros/*` to npm registry.
- Setting up a release pipeline / auto-update feed for the fork.
- Trademark filings for `Choros` (author accepts personal risk; not blocking this spec).
- Mobile app. Author does not build/ship mobile locally in a way that requires bundle-id change; if this changes, addendum spec.
- Domain purchase / DNS / custom domain for GH Pages. Landing page uses the default `tekton-ai.github.io/choros` URL. A placeholder domain string (`choros.dev`) may appear as a marker in constants where a display URL is required.
- Porting `apps/marketing/` to static export, changing its `next.config`, or otherwise making it GH-Pages-deployable. The new landing page is intentionally a separate, minimal artifact.
- Long-tail `plans/**` and `docs/plans/**` historical documents.
- Changing internal names in `.git/`, `bun.lock`, `node_modules/`.
- Renaming files under `apps/desktop/scripts/patch-dev-protocol.test.ts` where `"superset"` appears as a **user's real worktree name** in a fixture (`WORKTREE_BASE/superset/kitenite/feature-2058`) — those represent past workspace paths, not the product name. Fixture is updated only if the test's contract logically requires it.

## Integration with existing code

See `Requirements` above — every file the author will touch is named there with the specific edit. Total surface (from the initial grep): 569+ files across `apps/` and `packages/` contain the string `Superset`. The distribution is heavily skewed:

- **High-density, low-risk (bulk find-replace candidates):** i18n catalogs (repetitive strings), UI copy files, docs, AGENTS.md files.
- **Low-density, high-risk (must be read by a human):** build config (`electron-builder.ts` — one wrong char breaks packaging), shared constants (`packages/shared/src/constants.ts` — consumed everywhere), the agent-catalog id union (`packages/shared/src/agent-catalog.ts` — TypeScript literal type, ripples through the codebase).
- **Test fixtures with dual meaning:** paths like `/Users/xxx/projects/superset/` — some are product-name (rename), some are user-worktree-name (leave).

Plan stage will produce an exact file list bucketed this way with a landing order.

No new abstractions required. The prior spec proposed a `migration/legacyRebrand/` module for first-launch data import; **fork scope eliminates this** — the author's own machine gets a manual re-onboarding.

## Policy compliance

### Brand
No brand policy skill or `docs/policies/brand.md` in this repo. Author is sole audience; personal brand judgment applies. `Choros` chosen per positioning analysis in prior chat (χορός, "coordinated chorus" — matches the "orchestrate any agent" positioning).

### Security
- Bundle id change means the new build cannot read the old build's Keychain items. Author accepts this and will re-authorize once. No credentials transferred through code — the OS-mediated re-authorization path is the safe one.
- URL scheme change: registering `choros://` is straightforward; author will unregister `superset://` locally after verifying no deep-link references remain in personal bookmarks. Not code-relevant beyond the electron-builder registration.
- No auth/authZ, secrets, or dependency-chain changes.

### Compliance
- Author personally holds any trademark risk of adopting `Choros` (per intent scope clarification). Not a code concern.
- No PII / PCI / GDPR / SOC2 surface change.

### UX
- Author is the only user. No migration flow needed. Interaction patterns unchanged.

## Areas of concern

- **`BuiltinAgentId` typescript literal type is enforced across the codebase.** Changing `"superset"` to `"choros"` in the union requires updating every callsite that pattern-matches or filters on the literal — `automations/page.tsx` is one confirmed site; `lsp references` on the union member will find the rest at plan time. Any missed callsite will fail typecheck loudly, so this is a caught-at-compile-time concern, not a silent-runtime one.
- **`electron-builder.ts` and its canary sibling drift.** Two files with parallel structure that must stay in sync. Plan should update both in the same PR/commit; a single-file edit is a bug source.
- **Path-fixture ambiguity in `patch-dev-protocol.test.ts` and `pathBasename.test.ts`.** The word `superset` appears both as (a) the product/CLI name and (b) an example workspace directory name in path-parsing tests. Plan must read each case and decide per-fixture; a global sed will corrupt path-parsing tests. Concrete lines already identified in this spec's "Out of scope" section.
- **i18n `messages.po` regeneration is environment-sensitive.** Repo AGENTS.md warns catalogs "regenerated on top of local experiments will still commit noise." Plan must run `bun run --cwd packages/i18n check` from a clean tree, and use `orderBy: "messageId"` / `sort-po-references.ts` as already configured.
- **Some `Superset` occurrences are in comments describing upstream corporate context** (e.g. Slack integration notes about "Superset user" as a concept). These may either be renamed for consistency, or left as historical accuracy (the code was originally written for corp Superset). Plan should surface a sample and decide; the two policies produce different reader experiences.
- **Local desktop app: author must manually verify new build launches after bundle-id change** on their own macOS install (Gatekeeper re-approval prompt is expected first launch). Not a code concern; a manual verification step in plan's "Proof".
- **Trademark risk on `Choros` is personally-borne** per intent clarification. This spec does not gate on legal search. If author later needs to publish more widely, this concern reactivates.

## Author + Status

- **Author:** Claude (opus-4.7-1m via omp harness), on behalf of XXLOKI
- **Status:** `draft` — flip to `accepted` when the author accepts. All concerns above are either (a) plan-time engineering discipline items or (b) personally-owned by the author; none require external policy owners.
