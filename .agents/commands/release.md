---
description: Publish a Choros release, deploy GitHub Pages, and replace the local installation with the artifact matching the execution environment
argument-hint: "[version] [commit-or-ref] [--daemon]"
allowed-tools: Bash, Read
---

Run the complete Choros release workflow, not a canary build. Do not stop after dispatching CI: publish the versioned release, finish the matching CLI release and Pages deployment, then download, verify, and replace the local desktop app while preserving user data and running terminals.

Invoking this command authorizes this release and local installation. State the selected version, source SHA, detected OS/architecture, artifact format, and installation path before starting; do not ask for redundant confirmation. Never force-quit or restart Choros unless the user explicitly asks.

## 1. Resolve the release

- Read `scripts/release/README.md`, `apps/desktop/electron-builder.ts`, and the current `build-desktop.yml`, `release-desktop.yml`, `release-cli-lockstep.yml`, `release-cli.yml`, and `deploy-pages.yml` under `.github/workflows/`. Those files are authoritative; reuse the release toolchain instead of manually editing versions, tags, or release metadata.
- Interpret `$ARGUMENTS` as an optional plain `MAJOR.MINOR.PATCH`, optional commit/ref, and optional `--daemon`. A lone non-version argument is the source ref. Reject unknown flags or extra arguments; never pass raw arguments through to a shell.
- Run from the repo root. Check `gh auth status` and `gh repo view --json nameWithOwner,defaultBranchRef`; this command is for `tekton-ai/choros`, not the upstream Superset repository. Stop on an unexpected remote rather than publishing to it.
- Fetch `origin` and tags without force. Default to the newly fetched `origin/main`, **not the current workspace HEAD**. Resolve the selected ref to a full commit SHA and keep it fixed for this release. Do not switch, reset, stash, or commit the user's working tree; uncommitted changes are not released.
- If no version is supplied, choose the next plain patch above the highest desktop/CLI version in remote `desktop-v*` and `cli-v*` tags and the selected commit's desktop/host-service/CLI manifests. Include unpublished or abandoned version tags when choosing: they are already reserved. Do not derive the next version only from `/releases/latest` or a stale local `package.json`.
- An explicit version must advance the unified version and have unused desktop and CLI tags. If it already exists, inspect its release/run: resume that exact release when requested, otherwise choose a fresh version. Never move/delete a versioned tag or use `--republish` to overwrite an existing release.
- Detect the OS and native CPU architecture **where the download and replacement will actually execute**. Use `uname -s`/`uname -m` on macOS/Linux; on Windows use PowerShell's `[System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture` and OS information, not Git Bash's emulated `uname`. Normalize Darwin to macOS, `x86_64`/`AMD64` to x64, and `aarch64`/`ARM64` to arm64. On macOS also inspect `sysctl -n hw.optional.arm64` so Rosetta does not misidentify Apple Silicon as Intel.
- Never reuse the OS, architecture, installer extension, or installation path from an earlier session. An SSH host, container, or WSL shell is its own execution environment, not proof of the user's desktop OS; do not silently target another host or the Windows installation from WSL.
- Check the selected source's **actual CI build matrix**, not just packaging configuration. Currently it builds macOS arm64/x64 and Linux x64 only. Windows packaging config does not mean a Windows artifact is published. For an unsupported OS/architecture, or an environment where the local stable installation cannot be identified, stop **before creating a release branch, tag, PR, or publishing** and report the missing prerequisite. Do not substitute another platform/architecture, assume emulation, or invent a download URL.
- Resolve the existing stable installation on that execution host, its version, free space, ownership, and write access. On macOS prefer the actual stable bundle path (normally `/Applications/Choros.app`); on Linux resolve the actual AppImage path from the stable app's launcher or verified `APPIMAGE` path, following any symlink to its real target. Never assume `/Applications`, `~/Downloads`, or a Linux installation directory exists on every OS. Never overwrite Choros Canary, a dev app, or an unrelated executable; stop on an ambiguous target. Do not reset settings, credentials, databases, workspaces, or terminal state.

## 2. Build, publish, and finish lockstep

Use the explicit-commit path so the release tool provisions its dedicated release branch/worktree and opens the version-bump PR without modifying the current workspace:

```bash
bun run release desktop "$VERSION" "$SOURCE_SHA"
```

Append `--daemon` only when requested or required by the documented daemon-change guard. Do not bypass the guard. Run long operations under the agent's supervised process facility and keep following them to completion.

- Keep this first step draft-only: do **not** pass `--publish` or `--merge`. Verify CI explicitly before publishing; script exit status or the existence of a draft is not proof of success.
- Record the bump PR, `desktop-v$VERSION` tag, and its resolved commit SHA. The version-bump commit can differ from `SOURCE_SHA`; match release runs against the **tag commit**.
- Find the exact `release-desktop.yml` run by tag and SHA (for example, `gh run list --workflow release-desktop.yml --branch "$TAG" --json databaseId,headSha,status,conclusion,url`). Share its URL, then `gh run watch "$RUN_ID" --exit-status`. Require `status=completed` and `conclusion=success`, including validation, builds, and uploads. A missing, failed, or cancelled run must not proceed to publish or installation.
- Read the exact draft with `gh release view "$TAG"`. Verify its tag, provenance marker, commit, and expected assets against the successful run using the runbook's rules. Do not fabricate provenance or work around conflicting assets.
- Publish only that verified draft:

  ```bash
  gh release edit "$TAG" --draft=false
  ```

- Read it back: require the exact tag, non-draft, non-prerelease, and the expected desktop latest release. Do not mark an older release latest over a newer concurrent release.
- Merge the release tool's version-bump PR into `main` after its required checks pass, using `gh pr merge "$PR_NUMBER" --squash --delete-branch`. Do not bypass branch protection or merge unrelated PRs. Verify it actually merged; report a blocked bump PR instead of claiming completion.
- Publishing triggers `release-cli-lockstep.yml`, which creates the same-SHA `cli-v$VERSION` tag and dispatches `release-cli.yml`. Follow **both** runs and verify the published matching CLI release and completed `cli-latest` update (or a verified newer pointer). A CLI tag alone is not success. Desktop download and Pages work may proceed while these finish, but do not report the whole release complete while CLI is pending or failed.
- For failures, follow the runbook: retry failed jobs on the original run with `gh run rerun "$RUN_ID" --failed`, then watch it. Retain the original version, SHA, and verified bytes; never silently cut another version, rewrite tags, or replace published assets as a retry.

## 3. Deploy GitHub Pages

The established release flow includes the site. Desktop releases do not inherently trigger Pages; its push trigger is path-filtered.

- After the bump PR merges, resolve the current remote `main` SHA. Reuse a successful/in-progress `deploy-pages.yml` run for that SHA when one exists; otherwise dispatch:

  ```bash
  gh workflow run deploy-pages.yml --ref main
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

### macOS: exchange the app bundle

- Mount the DMG read-only with `hdiutil attach -readonly -nobrowse -plist`, and parse the returned mount point rather than guessing `/Volumes/...`. Require `Choros.app` with `CFBundleIdentifier=com.choros.desktop`, `CFBundleShortVersionString=$VERSION`, and a matching executable architecture.
- Stage a **complete new bundle** in a unique sibling directory on the installation filesystem using `ditto`. Verify its version/architecture and code-signing state against the workflow. The current fork disables Apple certificate signing; report unsigned/ad-hoc status instead of claiming a notarized release. If signing is expected, require `codesign --verify --deep --strict` and `spctl --assess --type execute` to pass. Never strip quarantine, change signatures, or bypass a system-policy failure; report any launch restriction separately from the verified download.
- Preserve the running application and terminals: do not quit the app, stop its host service, or copy files into the existing live bundle. On macOS, atomically exchange the staged and installed bundle paths using `renamex_np` with `RENAME_SWAP` (`0x00000002`), checking its return value/errno. Both paths must be on the same filesystem. If safe exchange is unavailable, leave the current installation intact and report the blocker instead of falling back to delete-then-copy.
- The exchanged staging path now holds the old bundle: retain it as a uniquely named, version-labelled backup. It may be moved to `~/Downloads` only if that is on the same filesystem; otherwise retain it beside the installation. Never overwrite/delete a previous backup. If moving it fails, preserve and report its actual staging path.
- Read `/Applications/Choros.app/Contents/Info.plist` (or the resolved installation path) again and verify the installed version and signature. Run the new bundled `Contents/Resources/resources/bin/choros --version` and require the release version. Do not run `choros update` or restart the host as an installation check.
- Detach only the DMG mounted by this invocation and remove empty staging directories; retain the installer and old-app backup. On any pre-exchange failure, leave the installed app untouched and clean up only this invocation's temporary resources.

### Linux: replace the AppImage

- Work only on the resolved stable AppImage file, not a mounted AppImage directory or the bundled executable inside it. Preserve the launcher's existing target path; do not leave it pointing to a removed, version-named file. If the installation is actually package-managed (`deb`, `rpm`, etc.), stop rather than overwriting package-owned files with an AppImage.
- Stage the verified AppImage as a new file in a unique sibling directory on the installation filesystem, leaving the current file untouched. Set executable permissions for its owner, preserve the intended installation permissions, and verify its hash after staging. Inspect the ELF architecture before executing it; require x64 for the current Linux artifact.
- Extract the staged AppImage into an invocation-owned temporary directory with `--appimage-extract` (no GUI or FUSE mount required). Read `package.json` inside the extracted `resources/app.asar` with an ASAR-capable reader and require its desktop version to equal `$VERSION`; run the extracted `resources/resources/bin/choros --version` and require the same version. Do not launch the desktop GUI as a version check.
- Preserve the existing AppImage under a unique version-labelled backup path on the same filesystem using a hard link, checking that it points to the old inode. Then atomically replace the installed path with the staged file using POSIX rename (`os.replace` or equivalent), not a copy/truncate into the live file. This keeps the old inode available to the running app and its mounts. If backup creation or atomic replacement fails, preserve the installed file and report the blocker; do not delete it or kill the process as a workaround.
- Recheck the installed file's hash, executable permissions, and packaged version against the verified staged artifact; retain the installer and old-AppImage backup. Remove only this invocation's extraction files and empty staging directories. Do not stop the host service, unmount the running application's filesystem, run `choros update`, or restart Choros.

## Completion

Report the version/source/tag commit, release and pipeline URLs (Desktop, lockstep, CLI, Pages), bump PR state, site URL, detected execution OS/architecture, selected artifact name, verified installer path/hash, installed version/path, and old-installation backup path. Distinguish any failure, unsupported target, or pending step from completed work.

Only after replacement succeeds, explicitly say: **the on-disk installation is updated; the running Choros was not restarted, so the new version takes effect after the user restarts it.** Do not claim installation on an unsupported/blocked target, or claim the new GUI was launched or tested when only its packaged version and bundled CLI were verified.
