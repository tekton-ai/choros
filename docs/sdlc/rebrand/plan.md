---
artifact: plan
feature: rebrand
author: Claude (opus-4.7-1m via omp harness), on behalf of XXLOKI
status: draft
created: 2026-09-01
intent: ./intent.md
spec: ./spec.md
---

# Plan — Rebrand `tekton-ai/superset` fork to Choros

_Prerequisite: `spec.md` in this folder is `status: accepted`._

## Blast-radius baseline

`grep -rIl -E 'Superset|superset' apps packages scripts .agents docs AGENTS.md` returns ~2,700 files. That number is misleading: it collapses to a handful of edit patterns applied over a lot of surface area. This plan groups by pattern, not by file.

## Files that change

### Category A — Load-bearing structural files (individually named, human-read edits)

| File | Change |
|---|---|
| `apps/desktop/electron-builder.ts` | `appId` → `com.choros.desktop`; `productName` → `Choros`; `schemes: ["choros"]`; `publish.owner` → `tekton-ai`; `publish.repo` → `choros`. |
| `apps/desktop/electron-builder.canary.ts` | Parallel changes to the canary sibling; keep field ordering identical to main. |
| `apps/desktop/scripts/patch-dev-protocol.ts` | `PROTOCOL_SCHEME` template `superset-${workspace}` → `choros-${workspace}`; `BUNDLE_ID` template `com.superset.desktop.${workspace}` → `com.choros.desktop.${workspace}`. |
| `apps/desktop/scripts/build-bundled-cli.ts` | Bundled binary path segment `superset` / `superset.exe` → `choros` / `choros.exe`. |
| `apps/desktop/src/main/lib/bundled-cli.ts` | `getBundledCliBinaryName` and `getBundledCliShimName` return values renamed. Marker constant `BUNDLED_CLI_SHIM_MARKER` inspected for embedded name; rename if present. |
| `apps/desktop/src/main/lib/bundled-cli.test.ts` | Fixtures asserting the binary/shim names updated. |
| `apps/desktop/src/main/lib/update-error-classification.test.ts` | Fixture strings `com.superset.desktop.ShipIt` → `com.choros.desktop.ShipIt`. Path `Superset.app` → `Choros.app`. |
| `apps/desktop/src/main/lib/update-error-redaction.test.ts` | Same fixture updates; verify redaction function still passes without needing dual-path recognition (spec removed that requirement — no upgrade pipeline). |
| `packages/shared/src/constants.ts` | `GITHUB_REPO = { OWNER: "tekton-ai", NAME: "choros", URL: "https://github.com/tekton-ai/choros" }`. |
| `packages/shared/src/builtin-terminal-agents.ts` | String literal `"superset"` in `BUILTIN_TERMINAL_AGENTS` → `"choros"`. |
| `packages/shared/src/agent-catalog.ts` | `BuiltinAgentId` union member `"superset"` → `"choros"`. **Typescript rippling ensues — see Risks.** |
| `packages/shared/src/host-agent-presets.ts` | Any `presetId: "superset"` → `"choros"`; label/name strings. |
| `packages/ui/src/assets/icons/preset-icons/index.ts` | `PRESET_ICONS` key `superset` → `choros`; import path of the icon asset. |
| `packages/ui/src/assets/icons/preset-icons/superset.{svg,png,…}` | File renamed to `choros.*`. Content of the SVG may still contain a Superset wordmark — replace with Choros wordmark or a placeholder mark for now. |
| `apps/desktop/src/renderer/hooks/useV2AgentChoices/useV2AgentChoices.ts` | Constant `SUPERSET_AGENT` → `CHOROS_AGENT`; `id`/`label`/`iconId` values follow. |
| `apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/page.tsx` | Filter `a.id !== "superset"` → `"choros"`. Comment referring to "in-app superset chat agent" updated. |
| `apps/api/integrations/slack/events/utils/work-objects/work-objects.ts` | `SUPERSET_PRODUCT_NAME` const → `CHOROS_PRODUCT_NAME = "Choros"`; the "Open in Superset" button label follows. |
| `apps/api/integrations/slack/events/utils/run-agent/run-agent.ts` | Symbol renames: `createSupersetMcpClient` → `createChorosMcpClient`, `supersetMcp` locals, `cleanupSuperset`, `SYSTEM_PROMPT` prose. |
| `apps/api/integrations/slack/events/utils/run-agent/mcp-clients.ts` | Same symbol renames. |
| `apps/api/src/app/.well-known/mcp/route.ts` | Description strings and any hardcoded doc URLs. |
| `apps/api/src/app/.well-known/mcp/server-card.json/route.ts` | `name`, `title`, `icon`, `description`, `serverUrl`; icon URL swap to a fork-hosted asset or placeholder. |
| `apps/api/src/app/.well-known/oauth-protected-resource/route.ts` and `[...path]/route.ts` | `resourceName`, `resourceDocumentation`. |
| `apps/api/integrations/slack/events/process-app-home-opened/build-home-view.ts` | All Slack home-tab strings. |
| `apps/api/integrations/slack/events/process-assistant-message/process-assistant-message.ts` | Pro-plan / linking-required copy. |
| `apps/api/integrations/slack/events/process-mention/process-mention.ts` | Same. |
| `apps/api/integrations/slack/events/utils/slack-image-assets/slack-image-assets.ts` | Error-message copy. |
| `apps/admin/src/app/layout.tsx` | `metadata.title`. |
| `apps/admin/src/app/(dashboard)/layout.tsx` | Breadcrumb label. |
| `apps/admin/src/app/(dashboard)/components/AppSidebar/components/AppSidebarHeader/AppSidebarHeader.tsx` | `alt="Superset"`, header text. |
| Every `package.json` in the workspace | Name field `@superset/<pkg>` → `@choros/<pkg>`. Root `@superset/repo` → `@choros/repo`. Script filters `--filter=@superset/…` → `--filter=@choros/…`. `homepage` field → `https://tekton-ai.github.io/choros`. |
| Every `tsconfig*.json` with `paths` / `references` referencing `@superset/*` | Path swap. |
| `bunfig.toml` | Comment mentions `@superset/desktop`; update to `@choros/desktop`. |
| `opencode.json` | **Do NOT rename** the `superset` MCP entry. It points at the upstream public MCP service (`api.superset.sh`), which any MCP-capable agent can consume. Confirmed used by `.mastracode/mcp.json` in this same repo. Add a JSON-comment-adjacent note (README or an inline `_comment` field if the schema allows) explaining that the name refers to the upstream service, not this fork. Similarly leave the `neon` / `linear` / `sentry` / `posthog` / `maestro` / `expo-mcp` entries — none is fork-branded. |

**Decision resolved (2026-09-01):** author confirmed `opencode.json` `superset` MCP entry stays. The endpoint is a public OAuth-gated service exposed by upstream Superset; other agents in this repo (Mastra Code) already consume it, so the fork keeps benefiting from upstream tooling without owning any of its infrastructure.

### Category B — Root-level documentation and manifests

| File | Change |
|---|---|
| `AGENTS.md` | Full rewrite of the intro paragraph (currently "Superset is an agent-first development platform…") and the "Orchestrating agents and workspaces" section (all `superset` CLI examples → `choros`). Keep references to `.superset/` directory unchanged — see Risks. |
| `README.md` | Rewrite for the fork's identity. Product name, download link (`github.com/tekton-ai/choros/releases/latest` — or "not yet publishing" note), docs link (`tekton-ai.github.io/choros`), badges (`github.com/tekton-ai/choros`), any external social links removed (author has none per spec). |
| `SECURITY.md` | Delete this file. It documents an upstream security-reporting process the fork cannot honor. Add a two-line note in README: "This is a personal fork. Report issues via GitHub Issues on this repo." |
| `CONTRIBUTING.md` | Rewrite: point at fork repo; drop upstream Discord/vendor references; note this is a personal fork accepting PRs at the author's discretion. |
| `DEVELOPMENT.md` | Rewrite: URLs, product name. Retain the `Superset workspace` / `./.superset/setup.local.sh` references — these describe the **parent Superset app** the author uses to develop this fork (see Risks). Prefer wording like "developed inside a Superset workspace (parent tool)" to make the distinction explicit. |
| `CODE_OF_CONDUCT.md` | Product name references only; retain community-standard body. |
| `LICENSE.md` | Copyright holder line only (Author: XXLOKI). Elastic-2.0 body unchanged. |
| `HOOKS_INVESTIGATION.md` | Product-name pass, if any. |
| `CLAUDE.md`, `CODEX.md`, `WARP.md` | Per repo convention these mirror `AGENTS.md`; run the same intro rewrite. |
| `package.json` | Covered in Category A but re-noted here for the root's scripts / homepage / description. |

### Category C — Bulk string sweep (find-replace with human review of diff)

Applied via a scripted pass, then a full-diff read before commit. Not by unsupervised `sed`.

| Path glob | Pattern | Notes |
|---|---|---|
| `packages/i18n/locales/**/messages.po`, `apps/*/locales/**/messages.po` | `Superset` → `Choros` in translated message text. IDs unchanged. | Then run `bun run --cwd packages/i18n check` from a clean tree, use `sort-po-references.ts` per repo AGENTS.md. |
| `apps/marketing/src/**/*.tsx`, `apps/marketing/content/**/*.md*` | Hero copy, section text, meta descriptions, JsonLd fields. i18n message-source constants. | `apps/marketing/` not deployed by this fork per spec; edits keep the tree typecheckable. |
| `apps/desktop/src/renderer/**/*.tsx` | User-visible strings only. | Skip test files at this stage; those go in Category D. |
| `apps/docs/**/*.md*` and `apps/docs/src/**/*.tsx` | Docs content. Product name and code samples using `superset` CLI. | Not deployed either but same typecheck-hygiene rule. |
| `.agents/skills/**/*.md` | Product name and CLI examples. | Read each; some skills are agent-instruction files that reference upstream Superset intentionally. |
| `apps/*/AGENTS.md`, `packages/*/AGENTS.md` | Product name and CLI examples; `Superset workspace` references retained where they describe the parent tool. | Sensitive to the parent-app distinction (see Risks). |

### Category D — Path-and-fixture files (per-fixture human decision, no sed)

The word `superset` in these files can be **product name**, **workspace-directory name**, or **path parser fixture**. Rename only when it means the product.

| File | Guidance |
|---|---|
| `apps/desktop/scripts/patch-dev-protocol.test.ts` | Fixtures use `superset` as a workspace/dir name (`WORKTREE_BASE/superset/kitenite/feature-2058`). Leave. Only the constants under test change per Category A. |
| `apps/desktop/src/renderer/lib/pathBasename/pathBasename.test.ts` | Uses `superset` as an example path segment. Leave. |
| `apps/desktop/src/lib/trpc/routers/changes/git-operations.test.ts` and `workspaces/utils/git.test.ts` | Fixtures like `owner: "superset-sh", repo: "superset"`. These describe an **upstream** GitHub repo shape; leave them so the test logic remains meaningful. |
| Anything under `apps/desktop/src/lib/trpc/routers/external/helpers.ts` and its tests referencing third-party bundle ids (JetBrains, Zed) | Not the target of this rebrand. Leave. |

### Category E — New files

| File | Purpose |
|---|---|
| `docs/site/index.html` | The GH Pages landing. One-page HTML: Choros name, tagline (adapted from HeroSection copy), brief description, one screenshot (author supplies), link to GitHub repo. No framework, no build step. |
| `docs/site/style.css` | Minimal styling. Inline in `index.html` is fine too; if inline, delete this row. |
| `docs/site/screenshot.png` (optional) | Author-supplied. |
| `.github/CODEOWNERS` (if not present) | Author as sole codeowner. Optional; skip if repo doesn't need it. |

### Category F — Renames (deferred to end)

| Action | Why last |
|---|---|
| GitHub repo rename `tekton-ai/superset` → `tekton-ai/choros`. | GitHub auto-301 old URL; all code changes committed under old name are still reachable; local remote updated via `git remote set-url origin`. |
| GitHub Pages enable, source = default branch `/docs/site`. | Requires repo to exist under new name to configure. |
| Delete `Superset.app` from local `/Applications`. | Only after new `Choros.app` build launches and the author confirms it works. |

### Category G — Explicitly NOT changed

- `.superset/` directory and everything in it. This directory is consumed by the **parent Superset app** (which the author uses on their development machine to open this fork as a workspace). Renaming `.superset/` breaks the dev environment: the parent app looks for that literal path. Even after the author's own build renames to Choros, the current dev flow depends on this convention.
- `bun.lock`, `node_modules/`, `.git/` internals.
- `plans/`, `docs/plans/` — frozen historical planning documents (spec: out of scope).
- `docs/sdlc/rebrand/` — this SDLC audit trail names both old and new brand deliberately.
- Test fixtures where `superset` is a workspace/dir name, per Category D.
- `opencode.json` `superset` MCP entry if author picks option (a) above.

## Order of work

Sequenced by dependency. Each step is one landable commit (or a small commit series that shares CI).

1. **Type-first: swap the `BuiltinAgentId` literal and its friends.** Edit `packages/shared/src/agent-catalog.ts`, `packages/shared/src/builtin-terminal-agents.ts`, `packages/shared/src/host-agent-presets.ts` together. TypeScript will error at every callsite of the old literal. Chase every error to green in this same commit (Category A entries in `apps/desktop/src/renderer/...`, `apps/api/integrations/slack/...`, `packages/ui/.../preset-icons/index.ts`). Run `bun run build`. This is the highest-risk change; do it first so the compiler is the safety net.

2. **Icon asset file rename.** Move `preset-icons/superset.*` → `preset-icons/choros.*`. Update the import in `packages/ui/src/assets/icons/preset-icons/index.ts`. If the SVG contains a Superset wordmark, replace with a Choros wordmark or temporary text mark.

3. **Package-name pass.** Update every `package.json` name field, every root-level script's `--filter=`, every `tsconfig.json` `paths` / `references`, and `bunfig.toml` comment. Run `bun install` then `bun run build` — Turbo's filter graph must resolve under the new names. This step is mechanical but touches every package, so it's alone in its commit.

4. **Build-config pass (desktop).** `electron-builder.ts` + `electron-builder.canary.ts` + `patch-dev-protocol.ts` + `build-bundled-cli.ts` + `bundled-cli.ts` + `bundled-cli.test.ts` + `update-error-*.test.ts`. Run `bun run --cwd apps/desktop build` (or the equivalent packaging command). Verify a real `.app` bundle is produced with the new bundle id.

5. **Shared constants + repo-URL constants.** `packages/shared/src/constants.ts` `GITHUB_REPO`. Any other constants scattered across the tree (`grep -r "superset-sh/superset"`) get updated in this commit. The repo hasn't been renamed yet, but GitHub 301 makes it safe to bake the new URL now.

6. **API-layer product strings.** `apps/api/src/app/.well-known/mcp/*`, `oauth-protected-resource/*`. `apps/api/integrations/slack/events/**` product-name copy + symbol renames.

7. **Admin + desktop-renderer product strings.** Category A entries under `apps/admin/*` and `apps/desktop/src/renderer/*` that weren't caught by step 1's typechecker chase.

8. **i18n sweep.** Script over `**/locales/**/messages.po`: replace `Superset` → `Choros` in message-text lines (not `#:` reference lines, not IDs). Then `bun run --cwd packages/i18n check` and `sort-po-references.ts` per repo AGENTS.md. Reviewer reads the full diff.

9. **UI copy sweep (apps/marketing/, apps/desktop/renderer, apps/docs, apps/web).** Category C bulk pattern. Reviewer reads the full diff. Files that also appeared in earlier steps skip; git-diff-friendly commit.

10. **Docs sweep.** Category B root-level docs + `.agents/skills/**/*.md` + `apps/*/AGENTS.md` + `packages/*/AGENTS.md`. Preserve `.superset/` and `Superset workspace` references per Category B/G. Reviewer reads the full diff — this is where the "parent-app vs product-name" ambiguity lives.

11. **Category D fixtures.** Confirm per-file that fixtures with `superset` as a workspace name were **not** touched by earlier bulk passes. Grep sweep afterward to confirm.

12. **New landing page.** Create `docs/site/index.html` (+ optional `style.css`). Test locally by opening the file in a browser. Commit.

13. **Delete `SECURITY.md`.** Add the two-line replacement note in `README.md`.

14. **Full-tree grep gate.** `grep -rIl -E 'Superset|superset' apps packages scripts .agents docs AGENTS.md README.md ...` — expected non-empty only at the allowlisted paths (Category D fixtures, `.superset/`, `docs/sdlc/rebrand/`, `plans/`, `docs/plans/`, comments that intentionally reference upstream). Any other hit is a miss; go fix.

15. **Rename repo on GitHub.** Web UI: Settings → Rename. Update local: `git remote set-url origin git@github.com:tekton-ai/choros.git`. Enable GitHub Pages (Settings → Pages → source: default branch, `/docs/site`).

16. **Author's local machine.** Build and launch new Choros.app. Approve Gatekeeper prompt (first run of new bundle id). Re-authorize any Keychain items. Wipe local settings DB (per spec recommendation) or accept a one-shot startup migration if the author wrote one in step 1.

17. **Delete `Superset.app`** from `/Applications` after `Choros.app` runs cleanly. (Not required — old app coexists safely due to different bundle id, but keeps the machine clean.)

Steps 1–14 are all inside the repo and can be interleaved with normal work. Step 15 is a hard cutover. Step 16 is per-machine setup.

## Risks

- **`BuiltinAgentId` type ripple.** Likelihood: HIGH (this is a discriminated-union literal change). Blast radius: LOW — TypeScript surfaces every callsite; nothing ships silently. Mitigation: step 1 does the change and chases all errors in one commit. `lsp references` on the union member before starting to know the count.

- **`electron-builder.ts` and canary drift.** Likelihood: MEDIUM (two parallel files, easy to update only one). Blast radius: MEDIUM — a broken canary config wastes a build cycle but doesn't ship. Mitigation: edit both in the same commit; `git grep 'com.superset' apps/desktop/electron-builder*` post-edit to prove parity.

- **Path-fixture ambiguity in tests.** Likelihood: MEDIUM (bulk sed would trigger; scripted pass with human review avoids it). Blast radius: HIGH — silently wrong path-parsing tests continue to pass while the actual logic breaks against new inputs. Mitigation: Category D lists the exact files; step 11 is a dedicated verification pass; the `--include=*.test.ts` grep after step 9 catches misses.

- **i18n `.po` catalog noise from non-clean regeneration.** Likelihood: MEDIUM (author might have uncommitted local i18n edits before step 8). Blast radius: LOW — commit contains cosmetic noise, but no runtime breakage. Mitigation: `git status` before step 8, stash if needed, run from clean tree, sort references per repo convention.

- **`.superset/` directory accidentally renamed.** Likelihood: LOW (Category G calls it out explicitly). Blast radius: HIGH — kills the author's dev environment because the parent Superset app expects that literal directory name. Mitigation: explicit exclusion in every script; the plan's step 14 grep-gate has `.superset/` in the allowlist.

- **`Superset workspace` doc references over-rewritten.** Likelihood: MEDIUM (during step 10's docs sweep). Blast radius: LOW — reader confusion, not runtime. Mitigation: step 10 explicitly says "preserve references describing the parent tool"; reviewer reads the full doc diff.

- **GitHub repo rename breaks CI badges / hardcoded URLs.** Likelihood: MEDIUM. Blast radius: LOW — badges show 404 but nothing else fails. Mitigation: step 5 bakes new URL into `GITHUB_REPO` constant; step 15 renames repo; `grep -r "superset-sh/superset"` in `.github/` before step 15.

- **Icon asset SVG still contains a Superset wordmark.** Likelihood: MEDIUM (rename doesn't touch pixels). Blast radius: LOW — visible ugly bug. Mitigation: step 2 explicitly requires wordmark replacement or placeholder.

- **Author's real trademark exposure on `Choros`.** Likelihood: unknown, personal. Blast radius: personal legal. Mitigation: per intent scope clarification, author accepts this risk. Not a technical mitigation.

- **`opencode.json` MCP name `superset` semantics.** Likelihood: LOW (it's one line). Blast radius: LOW — either it keeps working (option a) or it stops working and the author notices (option b). Mitigation: explicit decision noted in Category A.

## Proof

**Automated (must pass, gate on merge):**
- `bun run build` at repo root — full Turbo build. Any broken `@superset/*` import or `BuiltinAgentId` reference blows this up.
- `bun run test` at repo root — including `apps/desktop/src/main/lib/*.test.ts` (bundle-id / redaction fixtures) and every catalog/glob change.
- `bun run --cwd packages/i18n check` — Lingui strict compile. Any half-translated message fails.
- Root-level grep gate script (add as `scripts/rebrand-grep-gate.sh`, deletable after cutover):
  ```
  grep -rIlE 'Superset|superset' apps packages scripts .agents docs AGENTS.md README.md \
    | grep -vE '^(node_modules|\.git|bun\.lock|docs/sdlc/rebrand|plans|docs/plans|\.superset)/' \
    | grep -vFf scripts/rebrand-allowlist.txt \
    | { grep . && echo 'FAIL: unexpected leftover mentions' && exit 1; exit 0; }
  ```
  The `rebrand-allowlist.txt` names Category D fixtures line by line so a future stray change against them fails visibly.

**Manual (author performs on own machine):**
1. `bun run --cwd apps/desktop build:mac` (or the fork's equivalent packaging command). Result: `Choros.app` under `apps/desktop/dist/` (or configured out dir).
2. Copy to `/Applications`, launch. Expected: Gatekeeper prompt (first run of new bundle id `com.choros.desktop`); after approval, app opens.
3. Verify window title reads "Choros" (not Superset).
4. Verify menu bar shows Choros application menu.
5. Open the CLI shim: `which choros` → path under `/usr/local/bin/` or wherever `bundled-cli.ts` installs it. Run `choros --help`. Expected: help text with no `superset` in it.
6. Try a deep link: `open choros://` (empty). Expected: Choros.app foregrounds.
7. Open `docs/site/index.html` locally in browser. Expected: renders correctly.
8. Post-rename: visit `https://github.com/tekton-ai/superset` in browser. Expected: 301 to `.../choros`. Visit `https://tekton-ai.github.io/choros`. Expected: landing page renders.

**Rollout gates:** none applicable. Fork build, single user, no feature flags. Author flips their own machine.

**Monitoring / alerts:** none applicable. No prod surface, no metrics.

**Rollback:**
- Pre-repo-rename: normal `git revert` on the rebrand commit series. Repo name unchanged, no external URL rot.
- Post-repo-rename (step 15 onward): rename back on GitHub (also 301'd). No data loss.
- Post-`Superset.app`-deletion: reinstall from a prior release download if kept. Author is advised to keep the old `Superset.app` in `/Applications` for at least one week after cutover, in case migration reveals an unforeseen data-path dependency.

## Author + Status

- **Author:** Claude (opus-4.7-1m via omp harness), on behalf of XXLOKI
- **Status:** `draft` — flip to `accepted` when the author accepts. Then implementation begins per Order of work.
