# Choros Monorepo

Choros is an agent-first development platform, with an Electron desktop IDE, Next.js web apps, and an Expo mobile app as the main customer-facing surfaces. It's a Turborepo monorepo, deployed apps are in apps/ and supporting packages are in packages/, and we use tRPC for the api.

You're working inside a Choros workspace, an isolated git-worktree copy of this repo. "Workspace" in a user message means that, not an editor workspace.

## Project Structure

All projects in this repo should be structured like this:

```
app/
├── page.tsx
├── dashboard/
│   ├── page.tsx
│   ├── components/
│   │   └── MetricsChart/
│   │       ├── MetricsChart.tsx
│   │       ├── MetricsChart.test.tsx      # Tests co-located
│   │       ├── index.ts
│   │       └── constants.ts
│   ├── hooks/                             # Hooks used only in dashboard
│   │   └── useMetrics/
│   │       ├── useMetrics.ts
│   │       ├── useMetrics.test.ts
│   │       └── index.ts
│   ├── utils/                             # Utils used only in dashboard
│   │   └── formatData/
│   │       ├── formatData.ts
│   │       ├── formatData.test.ts
│   │       └── index.ts
│   ├── stores/                            # Stores used only in dashboard
│   │   └── dashboardStore/
│   │       ├── dashboardStore.ts
│   │       └── index.ts
│   └── providers/                         # Providers for dashboard context
│       └── DashboardProvider/
│           ├── DashboardProvider.tsx
│           └── index.ts
└── components/
    ├── Sidebar/
    │   ├── Sidebar.tsx
    │   ├── Sidebar.test.tsx               # Tests co-located
    │   ├── index.ts
    │   ├── components/                    # Used 2+ times IN Sidebar
    │   │   └── SidebarButton/             # Shared by SidebarNav + SidebarFooter
    │   │       ├── SidebarButton.tsx
    │   │       ├── SidebarButton.test.tsx
    │   │       └── index.ts
    │   ├── SidebarNav/
    │   │   ├── SidebarNav.tsx
    │   │   └── index.ts
    │   └── SidebarFooter/
    │       ├── SidebarFooter.tsx
    │       └── index.ts
    └── HeroSection/
        ├── HeroSection.tsx
        ├── HeroSection.test.tsx           # Tests co-located
        ├── index.ts
        └── components/                    # Used ONLY by HeroSection
            └── HeroCanvas/
                ├── HeroCanvas.tsx
                ├── HeroCanvas.test.tsx
                ├── HeroCanvas.stories.tsx
                ├── index.ts
                └── config.ts

components/                                # Used in 2+ pages (last resort)
└── Header/
```

1. **One folder per component**: `ComponentName/ComponentName.tsx` + `index.ts` for barrel export
2. **Co-locate by usage**: If used once, nest under parent's `components/`. If used 2+ times, promote to **highest shared parent's** `components/` (or `components/` as last resort)
3. **One component per file**: No multi-component files
4. **Co-locate dependencies**: Utils, hooks, constants, config, tests, stories live next to the file using them

### Exception: shadcn/ui Components

The `src/components/ui/` and `src/components/ai-elements` directories contain shadcn/ui components. These use **kebab-case single files** (e.g., `button.tsx`, `base-node.tsx`) instead of the folder structure above. This is intentional—shadcn CLI expects this format for updates via `bunx shadcn@latest add`.

## Database

Drizzle ORM, schema in `packages/db/src/`. Follow `.agents/skills/db-migrations/SKILL.md` to generate
migrations. Never hand-edit `packages/db/drizzle/` (SQL, `meta/_journal.json`, snapshots) without
explicit user confirmation, and never apply migrations against a shared or production database.

## Releases

Desktop, host-service, and cli share one version; cut releases on a dedicated branch. Runbook:
`scripts/release/README.md`. A *canary* is a separate thing: `bash scripts/release-canary.sh
[commit]` builds the rolling internal `desktop-canary` prerelease, not a versioned release.

## Orchestrating agents and workspaces

When work wants a fresh isolated environment, a parallel agent, or a long-running job, reach for the
`choros` CLI instead of hand-rolling git worktrees or doing it all serially in this one. It's
already on `PATH` in Choros terminals, and we dogfood it.

Replace the capitalized placeholders before running these:

```bash
choros ws create --project PROJECT_ID --branch BRANCH --agent claude --prompt "..."
choros agents create --workspace WORKSPACE_ID --agent claude --prompt "..."
choros ws list
choros terminals read --workspace WORKSPACE_ID --terminal TERMINAL_ID
choros ws delete WORKSPACE_ID
```

In order: an isolated workspace with an agent already working in it, another agent in an existing
workspace, what's running, what an agent is doing right now, and cleanup when you're done.

Spawning several related workspaces? Add `--tag SOME_TAG` (repeatable) to `ws create` — tagged
workspaces group into a sidebar folder of that name automatically, so a batch files itself instead
of scattering across the project. `ws list --tag SOME_TAG` filters to them, and
`ws update WORKSPACE_ID --tag ...` retags (`--clear-tags` ungroups). Automation-created workspaces
are tagged `automation` by default and collect in an "automation" folder.

`choros <command> --help` covers the rest (tasks, automations, hosts, settings). Pass `--json` for
parsable output; it's on by default under agent environments.

## Internationalization

User-facing strings use Lingui with explicit IDs — `<Trans id="area.name">Text</Trans>`
or `useLingui()`'s `t({ id, message })` in React, `i18n._({ id, message })` outside React
(Electron main). Numbers, currencies, and dates go through `@choros/i18n/format`
helpers, never `new Intl.*("en-US")` or `toLocale*` with a hardcoded locale. After adding
or changing strings, run `bun run --cwd packages/i18n check` (CI enforces it). Conventions
and ID scheme: `packages/i18n/README.md`; terms that never translate:
`packages/i18n/glossary.md`; strategy and phasing: `plans/20260826-i18n-strategy.md`.
Directories listed in `packages/i18n/test/enforced-dirs.ts` must not contain hardcoded
JSX text — add a directory there once it is fully converted. `errorMessage()` output is potentially
translated and is display-only: logs, Sentry/PostHog, and error classification use
`rawErrorMessage()` or the error object (enforced by `packages/i18n/test/display-only.test.ts`).

**Shipping locales.** `SUPPORTED_LOCALES` in `packages/i18n/src/locales.ts` is the single
source of truth — adding a locale there is what makes it appear in the Settings picker and
the optional onboarding step, and what `lingui.config.ts` must list. Every enabled locale
must be **fully translated**: `compile --strict` fails the build on a missing message, so
finish a translation before adding its locale. Native language names live in `LOCALE_LABELS`
and are never translated — someone stuck in the wrong language has to recognize their own.
Relative times use `formatRelativeTime`/`formatCompactRelativeTime`, not hand-rolled
"3d ago" helpers; `Intl` already knows every locale's wording.

Three traps worth knowing before you touch catalogs:

- **Editing English copy is not enough.** IDs are stable, so Lingui keeps the text loosely
  coupled to them: `locales/en/messages.po` is what actually renders, and translations are
  never invalidated when the English moves. `extract` runs `--overwrite` so the source locale
  is always regenerated, and the `check` script fails on translations the edit stranded.
  Details and the exemption file: `packages/i18n/README.md`.
- **Regenerate from a clean tree.** `messages.po` is environment-sensitive. Entry order and
  `#:` reference order both used to vary between macOS and Linux; `orderBy: "messageId"` and
  `scripts/sort-po-references.ts` pin them, but a catalog regenerated on top of local
  experiments will still commit noise.
- **`bun test` runs uncompiled source.** The Lingui macro rewrites `` message: `${n} items` ``
  into a placeholder message plus values at build time, so the catalog stores `{n} items`.
  Tests see neither, which is why `apps/desktop/test-setup.ts` shims the macros and `i18n._`.
  Mock that module with a Proxy, never a spread — `i18n` is a class instance and a spread
  drops `load`/`activate`.

## Further reading

- `.agents/skills/`: CDP UI verification, DB migrations, ticket format, and more. Read the matching
  `SKILL.md` when a task fits its description.
- `docs/agent-tooling.md`: where commands, skills, and per-agent-CLI config live.
- `apps/desktop/AGENTS.md`: desktop specifics (notices, persisted renderer state).
- `apps/mobile/AGENTS.md`: mobile structure and iOS-only scope.
- `docs/cloud-sandbox-mismatches.md`: where cloud workspace sandboxes don't fit assumptions the
  app makes about a machine someone owns. Read it before touching sandboxes, and add to it when
  you find a new one.
- `docs/cloud-sandbox-considerations.md`: what cloud sandboxes still owe before they leave the
  team — billing, credential blast radius, untested behaviour.


## AI-Native SDLC

This project uses the AI-Native SDLC workflow for substantial changes (features, refactors, incident diagnosis). The workflow rules, phase-by-phase guidance, and templates live in the `ai-native-sdlc` skill — install it once (see the skill's README) and it activates automatically. This section tells you what the workflow looks like **inside this project**.

### 1. What to read

- **Workflow rules and phase-by-phase guidance** — the `ai-native-sdlc` skill (`SKILL.md` + `references/*.md`). The skill is loaded per session; do not duplicate its content into this project.
- **Templates for the artifacts you produce** — read them directly from the skill's `assets/*.template.md`. **Do not copy templates into this project.**
- **The previous stage's artifact for gate check**:
  - Before drafting `spec.md`: read `docs/sdlc/<slug>/intent.md`, verify frontmatter `status: accepted`.
  - Before drafting `plan.md`: read `docs/sdlc/<slug>/spec.md`, same gate.
  - Before implementing code: read `docs/sdlc/<slug>/plan.md`, same gate.

### 2. What to generate

Every change lives in its own folder under `docs/sdlc/<slug>/`:

- `docs/sdlc/<slug>/intent.md` — why we're doing it, who it's for
- `docs/sdlc/<slug>/spec.md` — what "done" looks like, policy constraints
- `docs/sdlc/<slug>/plan.md` — how the code changes, in what order, how we'll prove it

Slug convention:
- **Feature work:** `kebab-case` matching the git branch (e.g. `checkout-refund-flow`)
- **Incident work:** `incident-<YYYY-MM-DD>-<short-desc>` (e.g. `incident-2026-09-01-refund-500s`)

### 3. Generation strategy (gates and commits)

- **Frontmatter `status:` is the gate.** Every artifact is written with `status: draft`. Only the human owner flips it to `status: accepted`. **Never advance to the next stage without acceptance.**
- **One commit per artifact transition** — legibility in `git log`:
  ```
  sdlc(<slug>): add intent.md
  sdlc(<slug>): accept intent.md   # frontmatter draft → accepted
  sdlc(<slug>): add spec.md
  sdlc(<slug>): accept spec.md
  sdlc(<slug>): add plan.md
  sdlc(<slug>): accept plan.md
  ```
- **Audit trail:** `git log --follow docs/sdlc/<slug>/` reconstructs the full decision chain.
- **Implementation PR description links back to `docs/sdlc/<slug>/plan.md`.** If implementation reveals the plan was wrong, edit `plan.md`, get re-approval, then continue. Silent deviation breaks the audit trail.

### 4. Format (frontmatter schema)

All artifacts share a YAML frontmatter block:

```yaml
---
artifact: intent | spec | plan
feature: <slug>
author: <name-or-handle>
status: draft | accepted
created: <YYYY-MM-DD>
intent: ./intent.md    # spec and plan only
spec: ./spec.md        # plan only
---
```

Full section structure per artifact type — read the skill's templates:
- `<skill>/assets/intent.template.md`
- `<skill>/assets/spec.template.md`
- `<skill>/assets/plan.template.md`

(`<skill>` = the skill directory. Typical locations: `~/.claude/skills/ai-native-sdlc/` for Claude Code, `~/.codex/skills/ai-native-sdlc/` for Codex, or the equivalent for your agent.)

### When to skip

Skip the full three-artifact chain for: typo fixes, dependency bumps, docs edits with no policy implication, reverts. **Emergency hotfixes still need a retrospective `intent.md` + `spec.md` within one business day** — the audit trail must reflect reality.

### Approval matrix

| Artifact | Writes | Reviews | Escalation |
|---|---|---|---|
| `intent.md` | Initiator + agent | Product owner | — |
| `spec.md` | Agent (loading org skills) | Product owner + policy owners for flagged concerns | Tech lead for high-risk |
| `plan.md` | Agent in plan mode + engineer | Engineer | Tech lead / architect for high-risk |

High-risk = touches auth, payments, PII, migrations, external contracts, compliance surface, or anything the team has previously written a post-mortem about.
