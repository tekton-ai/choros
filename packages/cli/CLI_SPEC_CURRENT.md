# Choros CLI Current-State Reference

This document records the CLI surface implemented in `packages/cli` as of
2026-05-12. Public user-facing docs live in
`apps/docs/content/docs/cli/`.

## Source Of Truth

- CLI package: `packages/cli`
- CLI config: `packages/cli/cli.config.ts`
- Command files: `packages/cli/src/commands/**/command.ts`
- Command groups: `packages/cli/src/commands/**/meta.ts`
- CLI framework: `packages/cli-framework/src`
- Built version: `0.2.14`

To regenerate a command inventory:

```bash
find packages/cli/src/commands -type f -name 'command.ts' | sort
```

For rendered help, build or use the bundled binary and run:

```bash
choros --help
choros <group> --help
choros <group> <command> --help
```

## Top-Level Commands

```text
choros agents
choros auth
choros automations
choros hosts
choros organization
choros projects
choros start
choros status
choros stop
choros tasks
choros terminals
choros update
choros workspaces
```

Aliases:

| Alias | Target |
| --- | --- |
| `auto` | `automations` |
| `org` | `organization` |
| `t` | `tasks` |
| `term` | `terminals` |
| `ws` | `workspaces` |

## Implemented Command Tree

```text
agents
  create
  list
auth
  login
  logout
  whoami
automations
  create
  delete
  get
  list
  logs
  pause
  prompt
    get
    set
  resume
  run
  update
hosts
  list
organization
  list
  members
    list
  switch
projects
  create
  list
  setup
tasks
  create
  delete
  get
  list
  statuses
    list
  update
terminals
  create
workspaces
  create
  delete
  list
  open
  update
```

There are no `devices` or `host` command groups in the current CLI. Host
server lifecycle is handled by top-level `start`, `status`, and `stop`.

## Global Options

| Option | Env | Notes |
| --- | --- | --- |
| `--json` | | Prints the command data payload as formatted JSON. No `{ "data": ... }` envelope. |
| `--quiet` | | Prints IDs for arrays or single objects when possible; falls back to JSON otherwise. |
| `--api-key <key>` | `CHOROS_API_KEY` | Uses an API key instead of stored OAuth credentials. |
| `--help`, `-h` | | Recognized at root, group, and leaf command levels. |
| `--version`, `-v` | | Prints the CLI version. |

Agent/CI mode defaults output to JSON when any of these environment
variables are set to a non-empty value:

```text
CLAUDE_CODE
CLAUDECODE
CLAUDE_CODE_ENTRYPOINT
CODEX_CLI
GEMINI_CLI
CHOROS_AGENT
CI
```

## Runtime State

CLI runtime state is under `CHOROS_HOME_DIR`, defaulting to
`~/.choros`.

| Path | Purpose |
| --- | --- |
| `~/.choros/config.json` | OAuth token, expiry, and active organization ID. |
| `~/.choros/host/<organizationId>/manifest.json` | Host service PID, endpoint, auth token, and organization ID. |
| `~/.choros/host/<organizationId>/host.db` | Host service SQLite database. |

## Desktop Shim And Standalone Install

The desktop app installs an app-managed shim at
`<CHOROS_HOME_DIR>/bin/choros` (`~/.choros/bin/choros` by default)
when the app starts. Choros desktop terminals prepend that directory to
`PATH`, so the bundled CLI is available in app-launched terminals without a
standalone install.

The desktop app uses the same host manifest schema and home tree in
production, so a desktop-started host service and a CLI-started host
service can discover each other through the same manifest path.

Desktop-managed terminals also set `CHOROS_ORGANIZATION_ID` to the
workspace's organization. The CLI prefers that invocation-scoped value over
the active organization stored in `config.json`, which keeps workspace and
host routing aligned without changing the user's global CLI selection.

The desktop bundle contains only the `choros` executable, not the standalone
`choros-host` runtime and its Node/native dependencies. `choros start`
discovers Desktop's already-running service through the shared manifest; use
the standalone CLI distribution when a new headless host service must be
launched.

The standalone install script is separate from runtime state. It installs
the CLI and host binary under `CHOROS_HOME` (default `~/choros`) and
adds `<CHOROS_HOME>/bin` to the user's shell `PATH`. These locations do
not overwrite each other; whichever `bin` directory appears first in `PATH`
wins for a normal shell.

## Distribution

`packages/cli/package.json` currently exposes first-class standalone build
scripts for:

| Script | Target |
| --- | --- |
| `build:darwin-arm64` | `bun-darwin-arm64` |
| `build:linux-x64` | `bun-linux-x64` |
| `build:all` | darwin arm64 + linux x64 |

The desktop app has its own bundling script,
`apps/desktop/scripts/build-bundled-cli.ts`, which compiles the CLI into
`apps/desktop/dist/resources/bin/choros` for the Electron package target.

## Current Notes And Gaps

- Required named options are enforced by the parser, but help output does
  not visually mark named options as required. Positional required args are
  marked.
- `CHOROS_API_URL`, `CHOROS_WEB_URL`, and `RELAY_URL` are baked into
  built binaries by `cli.config.ts`. Runtime shell overrides are mainly for
  dev builds and custom compile environments.
- `readConfig()` parses `config.json` directly. A malformed config file can
  still surface as a raw JSON parse failure.
- `start` has different JSON shapes for an already-running host
  (`{ pid, endpoint }`) and a newly started host
  (`{ pid, port, organizationId }`).
- `stop` removes the manifest after normal termination, but if the initial
  `SIGTERM` call itself throws, the command returns an error before
  `removeManifest()`.
- `spawnHostService()` inherits the parent `process.env` before applying
  host-specific overrides.
- `update` is intended for built binaries. Running it from `bun run dev`
  is expected to fail because there is no install root to replace.
