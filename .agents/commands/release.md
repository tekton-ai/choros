---
description: Publish a Choros release, deploy GitHub Pages, and replace the local installation with the artifact matching the execution environment
argument-hint: "[version] [commit-or-ref] [--daemon]"
allowed-tools: Bash, Read
---

Run the complete Choros release workflow, not a canary build. Do not stop after dispatching CI: publish the versioned release, finish the matching CLI release and Pages deployment, then download, verify, and stage the local desktop update. Replace the installation only after its old runtime has exited; preserve user data and never interrupt running terminals to install.

Invoking this command authorizes this release and local installation. State the selected version, source SHA, detected OS/architecture, artifact format, and installation path before starting; do not ask for redundant confirmation. Never force-quit or restart Choros unless the user explicitly asks. If its runtime is active, arrange deferred installation and report it as pending, not installed.

## 1. Resolve the release

- Read `scripts/release/README.md`, `apps/desktop/electron-builder.ts`, and the current `build-desktop.yml`, `release-desktop.yml`, `release-cli-lockstep.yml`, `release-cli.yml`, and `deploy-pages.yml` under `.github/workflows/`. Those files are authoritative; reuse the release toolchain instead of manually editing versions, tags, or release metadata.
- Interpret `$ARGUMENTS` as an optional plain `MAJOR.MINOR.PATCH`, optional commit/ref, and optional `--daemon`. A lone non-version argument is the source ref. Reject unknown flags or extra arguments; never pass raw arguments through to a shell.
- Run from the repo root and check `gh auth status`. Before fetching or making any remote mutation, inspect **all effective fetch and push URLs** with `git remote get-url --all origin` and `git remote get-url --push --all origin` (push URLs may differ). Parse the host and owner/repo from HTTPS, SCP-style SSH, or `ssh://` URLs, removing an optional `.git` suffix/trailing slash; require every destination to identify exactly `github.com/tekton-ai/choros`. Reject forks, upstream Superset, unknown SSH aliases, misleading hostnames, or conflicting destinations; do not rewrite remotes automatically.
- Also check the unqualified `gh repo view --json nameWithOwner,defaultBranchRef` resolves to `tekton-ai/choros`; checking only `gh` is insufficient because the release script pushes to `origin`. After both checks pass, set `REPO=tekton-ai/choros` and pass `GH_REPO=$REPO` as a **process-scoped environment override** to the release script and its child `gh` calls. Pin repository reads with `gh repo view "$REPO"`, pass `--repo "$REPO"` to every subsequent PR/run/workflow/release operation, and use `repos/$REPO/...` for API endpoints. Never change the user's global `gh` default repository or assume it controls Git pushes.
- Fetch `origin` and tags without force. For a **new** release, default to the newly fetched `origin/main`, not the current workspace HEAD. Resolve the selected ref to a full commit SHA and keep it fixed. For an **existing** release, recover the original source/tag identity using the resume path below, never current `main`. Do not switch, reset, stash, or commit the user's working tree; uncommitted changes are not released.
- If no version is supplied, choose the next plain patch above the highest desktop/CLI version in remote `desktop-v*` and `cli-v*` tags and the selected commit's desktop/host-service/CLI manifests. Include unpublished or abandoned version tags when choosing: they are already reserved. Do not derive the next version only from `/releases/latest` or a stale local `package.json`.
- Determine new versus resumed release from the remote desktop tag before invoking any release script. An explicit version with an existing `desktop-v$VERSION` means **resume that version**, even if newer versions now exist; go directly to section 2's resume path. An unused version must advance the unified version and have unused desktop and CLI tags. A CLI-only tag, local-only conflicting tag, or release object without its remote desktop tag is a conflict, not permission to recreate anything. Never silently choose a different version, move/delete a versioned tag, or use `--republish`.
- Detect the OS and native CPU architecture **where the download and replacement will actually execute**. Use `uname -s`/`uname -m` on macOS/Linux; on Windows use PowerShell's `[System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture` and OS information, not Git Bash's emulated `uname`. Normalize Darwin to macOS, `x86_64`/`AMD64` to x64, and `aarch64`/`ARM64` to arm64. On macOS also inspect `sysctl -n hw.optional.arm64` so Rosetta does not misidentify Apple Silicon as Intel.
- Never reuse the OS, architecture, installer extension, or installation path from an earlier session. An SSH host, container, or WSL shell is its own execution environment, not proof of the user's desktop OS; do not silently target another host or the Windows installation from WSL.
- Check the selected source's **actual CI build matrix**, not just packaging configuration. Currently it builds macOS arm64/x64 and Linux x64 only. Windows packaging config does not mean a Windows artifact is published. For an unsupported OS/architecture, or an environment where the local stable installation cannot be identified, stop **before creating a release branch, tag, PR, or publishing** and report the missing prerequisite. Do not substitute another platform/architecture, assume emulation, or invent a download URL.
- Resolve the existing stable installation on that execution host, its version, free space, ownership, and write access. On macOS prefer the actual stable bundle path (normally `/Applications/Choros.app`); on Linux resolve the actual AppImage path from the stable app's launcher or verified `APPIMAGE` path, following any symlink to its real target. Never assume `/Applications`, `~/Downloads`, or a Linux installation directory exists on every OS. Never overwrite Choros Canary, a dev app, or an unrelated executable; stop on an ambiguous target. Do not reset settings, credentials, databases, workspaces, or terminal state.

## 2. Build, publish, and finish lockstep

### New release only

Only when both versioned tags are unused, use the explicit-commit path so the release tool provisions its dedicated release branch/worktree and opens the version-bump PR without modifying the current workspace:

```bash
GH_REPO="$REPO" bun run release desktop "$VERSION" "$SOURCE_SHA"
```

Append `--daemon` only when requested or required by the documented daemon-change guard. Do not bypass the guard. Run long operations under the agent's supervised process facility and keep following them to completion.

- Keep this first step draft-only: do **not** pass `--publish` or `--merge`. Verify CI explicitly before publishing; script exit status or the existence of a draft is not proof of success.
- Record the bump PR, `desktop-v$VERSION` tag, and its resolved commit SHA. The version-bump commit can differ from `SOURCE_SHA`; match release runs against the **tag commit**.

### Resume an existing release

- **Skip `bun run release desktop` entirely.** Its existing-tag path fails or deletes/recreates the release with `--republish`; neither is a resume operation. Do not bump versions, create replacement tags, or pass `--daemon` to mutate an already tagged release.
- Resolve the authoritative remote `desktop-v$VERSION` tag to its commit, peeling annotated tags. Require that commit's desktop/host-service/CLI versions all equal `$VERSION`; an existing `cli-v$VERSION` must resolve to the same commit. Validate any supplied source ref against the original source or tag commit using the recorded release branch/history; an unrelated ref is a conflict. Do not substitute current `main` or infer the original source from an unrelated latest release.
- Read the existing release (draft or published), provenance marker, original workflow runs, and bump PRs in all states, pinned to `$REPO`. Match runs by workflow, tag, and **tag commit SHA**, not just title or version. Match the bump PR by its actual release branch and commit relationship; reuse a merged PR and do not merge unrelated work. If tag creation succeeded before PR creation, recover the exact release branch from remote refs and commit history, then open a missing bump PR only if its ownership and diff are verified. If identity cannot be recovered unambiguously, stop instead of guessing.
- An existing release must retain its tag, commit, provenance, asset hashes, and publication state. Missing/conflicting provenance on an existing release is a blocker per the runbook; never fabricate it. Only a confirmed 404 means the release is absent—auth or network errors must not select the new-release path.
- For an active original run, watch it. For failed original jobs, use `gh run rerun "$RUN_ID" --failed --repo "$REPO"`; for a cancelled run inspect and rerun its cancelled jobs/run using GitHub's supported retry path, retaining original artifacts. If no run exists after checking dispatch/push history, dispatch `gh workflow run release-desktop.yml --ref "$TAG" --repo "$REPO"` against the **existing tag**, never `main`. Reuse complete successful runs; do not rebuild partial assets when the required original bytes have expired—report the recovery prerequisite from the runbook instead.
- Once the original Desktop run and assets are complete, continue with the shared checks below. Publish only if still draft; leave an already published release published and do not toggle its state to retrigger lockstep. Resume the original failed lockstep/CLI run according to the runbook, merge only an unmerged verified bump PR, and continue Pages/download/installation from their actual states. Do not move desktop latest or `cli-latest` backward when resuming an older version, or automatically downgrade a newer local installation.

### Shared verification and publication

- Find the exact `release-desktop.yml` run by tag and SHA (for example, `gh run list --workflow release-desktop.yml --branch "$TAG" --repo "$REPO" --json databaseId,headSha,status,conclusion,url`). Share its URL, then `gh run watch "$RUN_ID" --exit-status --repo "$REPO"`. Require `status=completed` and `conclusion=success`, including validation, builds, and uploads. A missing, failed, or cancelled run must not proceed to publish or installation.
- Read the exact release with `gh release view "$TAG" --repo "$REPO"`. Verify its tag, provenance marker, commit, and expected assets against the successful run using the runbook's rules. Do not fabricate provenance or work around conflicting assets.
- Publish only if it is a verified draft, and no newer desktop release would be displaced; otherwise stop publication of the older draft and report it. Skip this mutation for an already published release:

  ```bash
  gh release edit "$TAG" --draft=false --repo "$REPO"
  ```

- Read it back: require the exact tag, non-draft, non-prerelease, and the expected desktop latest release. A resumed already-published version may have a verified newer desktop latest; leave that pointer unchanged and report both versions.
- Merge the release tool's version-bump PR into `main` after its required checks pass, using `gh pr merge "$PR_NUMBER" --squash --delete-branch --repo "$REPO"`. Skip an already merged PR. Do not bypass branch protection, revive a deliberately closed PR, or merge unrelated PRs. Verify it actually merged; report a blocked bump PR instead of claiming completion.
- Publishing triggers `release-cli-lockstep.yml`, which creates the same-SHA `cli-v$VERSION` tag and dispatches `release-cli.yml`. Follow **both** runs and verify the published matching CLI release and completed `cli-latest` update (or a verified newer pointer). A CLI tag alone is not success. Desktop download and Pages work may proceed while these finish, but do not report the whole release complete while CLI is pending or failed.
- For failures, follow the runbook: retry failed jobs on the original run with `gh run rerun "$RUN_ID" --failed --repo "$REPO"`, then watch it. Retain the original version, SHA, and verified bytes; never silently cut another version, rewrite tags, or replace published assets as a retry.

## 3. Deploy GitHub Pages

The established release flow includes the site. Desktop releases do not inherently trigger Pages; its push trigger is path-filtered.

- After the bump PR merges, resolve the current remote `main` SHA. Reuse a successful/in-progress `deploy-pages.yml` run for that SHA when one exists; otherwise dispatch:

  ```bash
  gh workflow run deploy-pages.yml --ref main --repo "$REPO"
  ```

- Record the dispatched run's actual SHA and URL. If `main` advanced during dispatch, report the commit actually deployed rather than calling it the pinned desktop source. Pages always deploys `main`, not an arbitrary feature ref.
- Wait for the build **and deployment** to succeed. If a later `main` push supersedes the run, follow its replacement rather than treating cancellation as success. Read the deployment's URL and verify the site responds; normally it is `https://tekton-ai.github.io/choros/`.

## 4. Download and replace the platform-matched local app

### Select and verify the artifact

- Download from the exact `desktop-v$VERSION` release, never an unpinned `latest` URL, a canary, or an Actions artifact from another run. Read actual asset names, sizes, and digests from `gh api "repos/$REPO/releases/tags/$TAG"`.
- Match the detected OS **and** architecture to one exact versioned installer. Current naming contracts are:

  | Execution environment | Versioned artifact | Replacement procedure |
  | --- | --- | --- |
  | macOS arm64 (including Rosetta) | `Choros-$VERSION-arm64.dmg` | macOS bundle exchange below |
  | macOS x64 | `Choros-$VERSION-x64.dmg`, or the current Intel name `Choros-$VERSION.dmg` | macOS bundle exchange below |
  | Linux x64 (`x86_64`/`AMD64`) | `choros-$VERSION-x86_64.AppImage` or `choros-$VERSION-x64.AppImage`, as actually published | Linux AppImage replacement below |
  | Windows, Linux arm64, or any other unsupported target | None in the current CI matrix | Stop; do not download/install another platform's artifact |

- Require an unambiguous match; missing or conflicting candidates block download/installation. Ignore stable-name aliases, `.blockmap` files, update manifests, and CLI archives. Do not guess a missing filename or select the first asset. Do not use a DMG or macOS commands on Linux/Windows. If CI adds another platform later, establish its artifact and native installation contract before running an installer; do not assume an `.exe` can safely replace a running app.
- Resolve the execution user's download directory (for example, `~/Downloads` on macOS or `xdg-user-dir DOWNLOAD` on Linux). If none is configured, use a writable user-owned directory and report it. Create a fresh version-labelled subdirectory without overwriting a previous download, then:

  ```bash
  gh release download "$TAG" --repo "$REPO" --pattern "$ASSET_NAME" --dir "$DOWNLOAD_DIR"
  ```

- Check the downloaded byte length and SHA-256 against the authenticated release asset's `size` and `digest` (or its verified provenance hash). A missing/mismatched hash blocks installation; do not merely print a locally calculated hash and call it verified.

### Installation gate: wait for the old runtime to exit

- **Never replace a canonical installation path while its runtime is active, on either platform.** Atomic rename preserves open file descriptors, not future path-based loads: Choros's CLI shim embeds an absolute bundled-CLI path. Live replacement would let old Desktop/host processes execute new CLI/resources, breaking version lockstep.
- Stage and verify everything first, without changing the installed path, launchers, or CLI shims. Identify the installed Desktop, Electron helpers, host-service, and other consumers of that installation using executable/resource paths, process identity/start time, and host state. An unknown or still-running consumer blocks replacement; a single PID disappearing does not prove the whole runtime exited.
- If anything is active (including the Choros hosting this agent), leave it running. Create a concrete, invocation-owned external installer helper and durable status/log files outside the app bundle and DMG. Register it with a supervisor independent of Choros, such as a user LaunchAgent on macOS or a user systemd service on Linux; its interpreter and inputs must also survive Choros exiting. Do not rely on an agent-owned shell/background job being kept alive. Verify the helper was registered and reports **waiting for exit**; scheduling alone is not installation success. If no independent supervisor is available, retain the verified staging files and report deferred installation as blocked rather than performing a live swap.
- The helper must contain the exact stage/target/backup paths, old installation identity, target version and verified artifact hashes, not an unpinned latest lookup. It must wait without killing processes, inspect consumers again immediately before mutation, revalidate staged content and the unchanged target, and abort on a competing update, relaunched/unknown consumer, or verification error. Only after quiescence may it execute the platform replacement below. Keep backup and failure evidence; atomically record installed/failed status, and exit after this one installation. On retry, inspect the receipt/actual files before changing anything; never swap an old backup back into place by blindly replaying a completed exchange.
- Tell the user that installation is staged and waiting, where the status/log is, and to finish their work and exit Choros normally when ready. Do not stop its host or terminal services on their behalf; if they outlive the desktop, keep waiting and name that blocker. Ask them not to reopen Choros or invoke its CLI until the helper reports completion. Detach this invocation's DMG after staging; keep the staged files/helper alive until installation finishes. Never promise that the current live runtime was updated or that a normal restart alone proves replacement succeeded.
- If the old runtime is already fully stopped and the agent runs independently, installation can proceed immediately after the same identity, quiescence, and verification checks. Do not relaunch Choros automatically. A post-install failure must retain the backup and report the actual installed state, not claim completion or automatically roll back while new consumers might be running.

### macOS: replace the stopped app bundle

- Mount the DMG read-only with `hdiutil attach -readonly -nobrowse -plist`, and parse the returned mount point rather than guessing `/Volumes/...`. Require `Choros.app` with `CFBundleIdentifier=com.choros.desktop`, `CFBundleShortVersionString=$VERSION`, and a matching executable architecture.
- Stage a **complete new bundle** in a unique sibling directory on the installation filesystem using `ditto`. Verify its version/architecture and code-signing state against the workflow. The current fork disables Apple certificate signing; report unsigned/ad-hoc status instead of claiming a notarized release. If signing is expected, require `codesign --verify --deep --strict` and `spctl --assess --type execute` to pass. Never strip quarantine, change signatures, or bypass a system-policy failure; report any launch restriction separately from the verified download.
- **Only after the installation gate passes**, atomically exchange the staged and installed bundle paths using `renamex_np` with `RENAME_SWAP` (`0x00000002`), checking its return value/errno. Both paths must be on the same filesystem. Do not quit the app, stop its host service, copy into a live bundle, or treat inode preservation as runtime isolation. If safe exchange is unavailable, leave the installation intact and report the blocker instead of falling back to delete-then-copy.
- The exchanged staging path now holds the old bundle: retain it as a uniquely named, version-labelled backup. It may be moved to `~/Downloads` only if that is on the same filesystem; otherwise retain it beside the installation. Never overwrite/delete a previous backup. If moving it fails, preserve and report its actual staging path.
- Read `/Applications/Choros.app/Contents/Info.plist` (or the resolved installation path) again and verify the installed version and signature. Run the new bundled `Contents/Resources/resources/bin/choros --version` and require the release version. Do not run `choros update` or restart the host as an installation check.
- Detach only the DMG mounted by this invocation once staging is complete. After successful installation, remove empty staging directories; retain the installer and old-app backup. While waiting for exit, retain the staged bundle and independent helper. On a pre-exchange failure, leave the installed app untouched and clean up only temporary resources that no pending helper needs.

### Linux: replace the AppImage

- Work only on the resolved stable AppImage file, not a mounted AppImage directory or the bundled executable inside it. Preserve the launcher's existing target path; do not leave it pointing to a removed, version-named file. If the installation is actually package-managed (`deb`, `rpm`, etc.), stop rather than overwriting package-owned files with an AppImage.
- Stage the verified AppImage as a new file in a unique sibling directory on the installation filesystem, leaving the current file untouched. Set executable permissions for its owner, preserve the intended installation permissions, and verify its hash after staging. Inspect the ELF architecture before executing it; require x64 for the current Linux artifact.
- Extract the staged AppImage into an invocation-owned temporary directory with `--appimage-extract` (no GUI or FUSE mount required). Read `package.json` inside the extracted `resources/app.asar` with an ASAR-capable reader and require its desktop version to equal `$VERSION`; run the extracted `resources/resources/bin/choros --version` and require the same version. Do not launch the desktop GUI as a version check.
- **Only after the installation gate passes**, preserve the existing AppImage under a unique version-labelled backup path on the same filesystem using a hard link, checking that it points to the old inode. Then atomically replace the installed path with the staged file using POSIX rename (`os.replace` or equivalent), not a copy/truncate into the file. This retains a recoverable backup; it is not permission to replace a live runtime. If backup creation or atomic replacement fails, preserve the installed file and report the blocker; do not delete it or kill processes as a workaround.
- Recheck the installed file's hash, executable permissions, and packaged version against the verified staged artifact; retain the installer and old-AppImage backup. Remove only this invocation's extraction files and empty staging directories after they are no longer needed by the deferred helper. Do not stop the host service, unmount the running application's filesystem, run `choros update`, or restart Choros.

## Completion

Report the version/source/tag commit, release and pipeline URLs (Desktop, lockstep, CLI, Pages), bump PR state, site URL, detected execution OS/architecture, selected artifact name, and verified installer path/hash. Report installation separately as **staged/waiting**, **blocked/failed**, or **installed**, with the actual version/path, backup path if created, and deferred helper/status/log paths when applicable. Never call the entire workflow complete while installation is waiting or blocked.

Only after replacement and post-install verification succeed (read the external helper's durable result when deferred), say **the on-disk installation is updated; Choros was not automatically relaunched**. While its old runtime is active, say **the update is staged; the existing installation is unchanged and replacement is waiting for exit**. Do not claim installation on an unsupported/blocked target, or claim the new GUI was launched or tested when only its packaged version and bundled CLI were verified.
