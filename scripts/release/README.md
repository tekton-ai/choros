# Releasing

The release toolchain is `scripts/release/*.ts` (TypeScript, run by Bun — no build
step). One entry point: **`bun run release`**. Design/rationale lives in
[`plans/20260709-unified-version-bumping.md`](../../plans/20260709-unified-version-bumping.md).

## Model

- **desktop == host-service == cli** at each desktop release — one unified plain
  version, enforced by `bun run check:versions` (CI-gated). Publishing a desktop
  release fires `release-cli-lockstep.yml`, which tags the matching plain
  `cli-v<version>` so the standalone CLI ships in lockstep automatically.
- **CLI hotfixes lead by a patch.** Between desktop releases, a CLI-only fix bumps
  a plain patch above the current CLI (`1.14.1 → 1.14.2`), within desktop's minor
  line, until the next desktop release catches up.
- **No prerelease suffixes.** A suffix sorts *below* the release (so `choros
  update` won't deliver it) and fails the host-service min-version floor
  (`semver.satisfies` excludes prereleases). Everything stays plain.
- **pty-daemon** is on its own `0.x` track, bumped only with `--daemon`.

## Commands

| Command | When |
| --- | --- |
| `bun run release` | Interactive menu (TTY only). |
| `bun run release desktop [version]` | New app release. Moves desktop + host-service + cli together + publishes matching `cli-v`. Draft by default. |
| `bun run release cli [version]` | CLI-only hotfix **between** desktop releases → plain patch above the current CLI. |
| `… --daemon` | Also ship a pty-daemon fix (patch-bumps it on `0.x`). |
| `bun run release check` | Verify versions are unified (exit 1 on drift). |

`version` for a desktop release is `MAJOR.MINOR.PATCH` (or omit for the
patch/minor/major menu). See `bun run release desktop --help`.

## Cut from a release branch (not `main`)

Releases are cut on a **dedicated release branch**, not on `main` and not on your
feature branch. Two ways:

**A — release a specific commit (canary-style).** Provisions an ephemeral release
branch from the commit in a worktree, applies the version bump there, tags,
pushes, and opens the bump PR; your working tree is untouched:

```bash
bun run release desktop 1.15.0 <commit-sha>   # commit to release (e.g. a main SHA)
```

**B — from a release branch you're on.** Bumps the version, pushes the branch,
opens a PR, and tags:

```bash
git switch -c release-1.15.0
bun run release desktop 1.15.0
```

Either way, the `desktop-v<version>` tag triggers `release-desktop.yml`, and both
open a `chore(desktop): bump version to <version>` PR into `main` — merge it (or
pass `--merge`) so `main` carries the released version. Leaving it unmerged only
drifts `main`'s `package.json`: the next release reads the latest `desktop-v` tag,
not `package.json`.

## Desktop: draft → publish

Draft by default — nothing reaches users until you publish. Wait for the release
workflow to succeed (including all uploads), review the draft, then:

```bash
gh release edit desktop-v1.15.0 --draft=false      # publish
# or in one shot:
bun run release desktop 1.15.0 --publish [--merge] # auto-publish (+ merge the PR)
```

Once published (non-draft), it becomes `/releases/latest`, which the desktop
auto-updater reads. Publishing (either way) also triggers
`release-cli-lockstep.yml`, which verifies the desktop tag's commit, creates or
reuses the same-SHA `cli-v<version>` tag, and explicitly dispatches the CLI release
workflow. A tag created with `GITHUB_TOKEN` does not trigger a push workflow.
An existing tag alone does **not** mean the CLI release succeeded.

## When the daemon guard blocks

```
✗ pty-daemon/src changed since its last version bump … but this release
  doesn't bump the daemon.
```

The daemon changed but you're not bumping it → old daemons won't update. Re-run
with `--daemon` (for a desktop release you can instead ship the daemon fix via
`bun run release cli --daemon`).

## Validation and safe retries

Both release workflows run the reusable CI checks (**Sherif, Version Sync, Lint,
Test, Typecheck**) on the caller's exact commit, alongside their build. Publishing
depends on both jobs succeeding; failed or cancelled validation cannot publish.
The publisher also resolves annotated/lightweight version tags and requires their
commit to equal the workflow's `GITHUB_SHA`. Never move a versioned tag to fix a
failed run.

`github-release.ts` records the exact tag, commit and expected asset SHA-256 hashes
in a hidden release-body marker, preserving human release notes. Creation starts
as a draft; CLI publishes only after every asset is verified and stays a
**prerelease**, so it cannot shadow desktop's `/releases/latest`. Desktop remains
a draft until a maintainer publishes it. Retrying never turns a published release
back into a draft or silently replaces conflicting versioned assets.

### Interrupted creation, upload, or rolling update

Prefer retrying **failed jobs on the original run**; successful builds' uploaded
artifacts remain available to the retried publishing job:

```bash
gh run rerun <release-run-id> --failed
gh run watch <release-run-id>
```

A lost creation/upload response is recoverable: the existing release is reused,
verified uploads are retained, empty failed-upload starters are replaced, and
missing assets are uploaded. For a partial release, missing assets must have the
original recorded hashes. Rebuilding the same SHA can change timestamps or code
signatures; do not overwrite an existing asset or remove the provenance marker to
make a different artifact fit. If the original workflow artifacts have expired,
recover the original bytes from a trusted retained build, or cut a **new version**
through the normal release process. Do not repoint or delete the old tag as a retry.

If the versioned release is already complete, an entire workflow rerun is also
safe: the publisher verifies and retains its existing remote bytes even when a
rebuild differs. `cli-latest` is then populated from those original release assets,
not the new local build.

All CLI versions share a non-cancelling concurrency group. `cli-latest` updates
only after a verified, complete versioned CLI release; it is updated **in place**,
not deleted/recreated. Before replacing assets, the newer version is durably
recorded, so even an interrupted update prevents an older rerun from rolling the
pointer backward. Retry the newer CLI run to finish it. Lookup, download, deletion
and upload errors fail the job; only an actual HTTP 404 means a resource is absent.

### Lockstep tag exists but dispatch failed

Rerun the failed `Release CLI Lockstep` run with the same `gh run rerun … --failed`
command. It validates both SHAs and dispatches again if the CLI release or its
rolling update is absent or incomplete. It is an idempotent no-op only when the
same-SHA versioned release is complete and published, and a verified `cli-latest`
has completed at that version or a newer version. Lockstep never edits the pointer:
all recovery passes through the CLI publisher's separate concurrency group.

For a versioned CLI release that completed but failed while updating `cli-latest`,
retry the **CLI release run**, or rerun lockstep to dispatch it again. A newer
pending rolling reservation still blocks older CLI runs from moving the pointer
backward; retry that newer CLI run to finish its update. A fresh dispatch on an
existing tag is also available:

```bash
gh workflow run release-cli.yml --ref cli-v1.15.0
```

If a CLI-only hotfix already owns the matching version at a different SHA, lockstep
fails explicitly and preserves it. Cut the next unified desktop/host-service/CLI
version instead; never move or overwrite the hotfix tag.

### Historical releases

Existing versioned releases without the hidden provenance marker are not
automatically adopted: tag identity alone cannot establish the source of old
uploaded bytes. Leave those releases/tags intact and use a fresh version with this
workflow; do not fabricate metadata or use `--republish` as failure recovery.
A legacy `cli-latest` can be migrated only when its readable `version.txt`, matching
version tag, and pointer SHA agree. Missing/ambiguous ownership fails closed for
manual inspection. Historical runs/tags still execute their historical workflow;
these guards apply to commits that contain the updated workflows and helper.

### Local recovery checks

The behavior suite uses an in-memory GitHub boundary, never live mutations or
credentials:

```bash
bun test scripts/release/github-release.test.ts
bun run typecheck:release
```

It exercises lost create/upload responses, missing original artifacts, preserving
published assets/notes, annotated and conflicting tags, redispatch after failure,
non-404 API errors, interrupted rolling updates, and forward-only version ordering.

## Agent / non-interactive

Every action is reachable via flags; prompts only fire on a TTY. Pass a version
explicitly and add `--republish` to skip the tag-exists prompt. Flows also export
`runDesktop(args)` / `runCli(args)` for programmatic use.

## Prerequisites

- Run from the monorepo root.
- `gh` installed and authenticated (`gh auth status`).
