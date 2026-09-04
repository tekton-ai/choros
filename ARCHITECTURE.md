# Choros Architecture

This document describes the runtime shape of the Choros desktop app: what processes run, where they live, how they talk to each other, and what each package owns. It reflects the trimmed post-fork layout — `apps/` contains only `desktop`, everything else lives under `packages/`.

## Runtime processes

When a user launches the installed `Choros.app`, five distinct processes come up. Two are Electron internals, three are our own long-running services.

```
                       ┌────────────────────────────────────┐
                       │        Electron main process       │
                       │  (apps/desktop/src/main/index.ts)  │
                       │                                    │
                       │  • window / menu / tray            │
                       │  • notifications HTTP server       │◄─┐
                       │  • spawns host-service + pty-daemon│  │
                       └───────────────┬──────────┬─────────┘  │
                                       │ IPC      │ spawn      │
                                       ▼          ▼            │
    ┌──────────────────────────┐   ┌──────────────────┐   ┌────┴──────────────┐
    │  Electron renderer       │   │  host-service    │   │  pty-daemon       │
    │  (BrowserWindow)         │◄──►  (Hono HTTP+WS)  │   │  (Unix socket)    │
    │  React UI                │   │  localhost:$PORT │   │  ~/.choros/pty/*  │
    └──────────────────────────┘   └────────┬─────────┘   └────────┬──────────┘
                                            │                      │
                                            │ spawns terminals    ▼
                                            │              ┌──────────────────┐
                                            └─────────────►│  Agent CLIs      │
                                                           │  claude/codex/…  │
                                                           │  (in PTY)        │
                                                           └────────┬─────────┘
                                                                    │
                                                                    │ hook payload
                                                                    │ POST /hook/complete
                                                                    └────► Electron main
                                                                          notifications server
```

### 1. Electron main (`apps/desktop/src/main/`)

The Electron `BrowserWindow` host. Bootstraps everything else:

- Registers protocol handlers (`choros://` deep links)
- Runs migrations against the local settings DB (`packages/local-db`)
- Spawns `host-service` as a subprocess
- Adopts or spawns `pty-daemon` (survives across desktop restarts)
- Hosts the **notifications HTTP server** on a random localhost port
  (agent lifecycle hooks POST to `http://127.0.0.1:$CHOROS_AGENT_HOOK_PORT/hook/complete`)
- Serves the renderer's HTML from `dist/renderer/`

### 2. Electron renderer (BrowserWindow)

React app (`apps/desktop/src/renderer/`). Talks to:

- **main** over `contextBridge` IPC (`window.electronTrpc` for tRPC-over-IPC)
- **host-service** over HTTP + WebSocket (workspace data, terminal streams, git ops, chat streaming)

The renderer never talks to remote networks directly for app data — everything flows through host-service (which then reaches out to Anthropic / OpenAI / GitHub / etc. on the renderer's behalf).

### 3. host-service (`packages/host-service`, `packages/host-client`)

The **daemon** and the core "channel" of the architecture. A Hono-based HTTP + WebSocket server that owns:

- Workspace / project / task / session CRUD (persisted in per-org SQLite under `~/Library/Application Support/Choros/host/<org>/host.db`)
- Terminal lifecycle (create / attach / write / stream) — spawns real PTYs via `pty-daemon`
- Git operations (status / diff / commit / push) via `simple-git`
- Chat streaming (relays agent responses)
- Agent hook handler (records agent lifecycle events)

Runs as a subprocess of Electron main. Listens on a dynamic `localhost:$HOST_SERVICE_PORT`. The manifest is written to `~/Library/Application Support/Choros/host/<org>/manifest.json` so `packages/host-client` and the CLI can discover and connect.

**`packages/host-client`** is the TypeScript SDK for talking to a running host-service — the renderer and the CLI both consume it.

### 4. pty-daemon (`packages/pty-daemon`)

Long-running PTY supervisor. Kept as a separate process so terminals **survive desktop restarts** — closing `Choros.app` doesn't kill the Claude session you had going. Communicates with host-service over Unix domain socket at `~/Library/Application Support/Choros/pty/<org>.sock`.

Adopts an existing daemon on startup rather than spawning a new one (`packages/pty-daemon/src/supervisor`).

### 5. Notifications HTTP server (part of Electron main)

A tiny HTTP server (~50 lines) inside Electron main. Its only job is to receive agent lifecycle hook payloads. Agent wrappers written by `packages/agent-setup` inject a curl into `~/.claude/settings.json` (and equivalents for other agents); when the agent fires, curl POSTs a JSON payload to this server, and Electron main emits an `AGENT_LIFECYCLE` event that the renderer subscribes to for UI updates.

## Package layout

```
apps/
└── desktop/                       Electron app (main + renderer)

packages/
├── host-service/                  Hono daemon (the channel)
├── host-client/                   SDK to talk to host-service
├── pty-daemon/                    PTY supervisor process
├── agent-setup/                   Registers hooks into agent CLI configs
│                                    (~/.claude/settings.json, ~/.factory/…)
├── chat-runtime/                  LLM streaming, tool-calling loop
├── chat/                          High-level chat orchestration and React chat surfaces
├── provider-auth/                 Anthropic/OpenAI/GitHub key management
├── cli/                           `choros` CLI binary; drives host-service
├── cli-framework/                 CLI base (commands, output, prompts)
├── sdk/                           Programmatic SDK (thin over host-client)
├── ui/                            React UI primitives (shared across surfaces)
├── i18n/                          Lingui-based translations
├── shared/                        Constants / types shared everywhere
├── panes/                         Pane layout engine for split-view
├── port-scanner/                  Detects dev-server ports for browser pane
├── workspace-client/              Workspace RPC client
├── workspace-fs/                  Filesystem watching for workspace roots
├── local-db/                      SQLite settings DB (renderer state)
├── trpc/                          tRPC router type (consumed for types only)
├── auth/                          better-auth types (client-side only)
├── db/                            Drizzle schema (types only, no runtime)
└── macos-process-metrics/         macOS-specific CPU/mem readouts
```

## Communication channels

| From | To | Transport | Payload |
|---|---|---|---|
| Renderer | Main | `contextBridge` IPC (electronTrpc) | tRPC calls typed by `packages/trpc` |
| Renderer | host-service | HTTP + WebSocket on `localhost:$HOST_SERVICE_PORT` | tRPC over HTTP; WS for chat streams / event subscriptions |
| host-service | pty-daemon | Unix socket at `~/Library/Application Support/Choros/pty/<org>.sock` | JSON RPC (spawn / write / resize / stop) |
| CLI (`choros`) | host-service | HTTP on `localhost:$HOST_SERVICE_PORT` | Same tRPC surface as renderer |
| Agent CLI (Claude / codex / …) | Main notifications server | HTTP POST to `http://127.0.0.1:$CHOROS_AGENT_HOOK_PORT/hook/complete` | JSON hook event (SessionStart / Stop / PostToolUse / …) |

## Filesystem layout at runtime

```
~/Library/Application Support/Choros/
├── local.db                       Renderer settings (drizzle schema in packages/local-db)
├── host/
│   └── <org-uuid>/
│       ├── manifest.json          host-service port + pid for discovery
│       └── host.db                Per-org workspace/project/task/session data
├── pty/
│   └── <org-uuid>.sock            pty-daemon Unix socket
├── plugins/
│   └── mcp-ledger.json            Installed MCP server tracking
├── hooks/
│   └── notify.sh                  Agent lifecycle hook script (rewritten on boot)
├── bin/
│   └── <agent-name>               PATH-shim wrappers (packages/agent-setup)
└── state/
    └── default-<agent>-config-dir Account-switch pointer per agent
```

The **`.choros/` directory inside a workspace** (NOT to be confused with the app-data dir above) is a per-workspace config surface used only during local development of the fork itself — it holds `setup.local.sh`, `config.local.json`, etc. It is **not** shipped to end users.

## Environment variables

The `CHOROS_*` env var set is the runtime protocol between the Electron main process, host-service, terminal wrappers, and agent CLI hook scripts. Full reference: [`environment-variables.md`](./environment-variables.md).

## Where to change what

| Symptom / feature | Where the code lives |
|---|---|
| Window / menu / dock behavior | `apps/desktop/src/main/` |
| UI look, keyboard shortcuts | `apps/desktop/src/renderer/` |
| Workspace / project / task CRUD | `packages/host-service/src/{workspaces,projects,tasks}/` |
| Terminal spawn / stream | `packages/host-service/src/terminal/` + `packages/pty-daemon/src/` |
| Agent CLI integration (new agent) | `packages/agent-setup/src/agent-wrappers-<name>.ts` + entry in `packages/shared/src/builtin-terminal-agents.ts`. See [`agent-tooling.md`](./agent-tooling.md). |
| LLM streaming / tool-use loop | `packages/chat-runtime/` |
| Chat UI surfaces | `packages/chat/` + `apps/desktop/src/renderer/routes/…/chat` |
| CLI commands (`choros ws …`) | `packages/cli/src/commands/` |
| Bundled skills for agents | `plugins/choros/skills/` — see [`skill-preload-feature.md`](./skill-preload-feature.md) |
| Project path resolution | `packages/host-service/src/projects/` — see [`design/v2-host-project-paths.md`](./design/v2-host-project-paths.md) |
| Project create / import flow | See [`design/v2-project-create-import.md`](./design/v2-project-create-import.md) |
| Workspace setup scripts | See [`V2_WORKSPACE_SETUP_SCRIPTS.md`](./V2_WORKSPACE_SETUP_SCRIPTS.md) |

## Local verification (dev)

Once running via `bun run dev`:

```bash
# Processes
ps aux | grep -E "[C]horos|[h]ost-service|[p]ty-daemon" | grep -v grep

# Ports host-service picked
cat ~/Library/Application\ Support/Choros/host/*/manifest.json | jq .port

# Talk to host-service
curl -s http://localhost:$(jq -r .port ~/Library/Application\ Support/Choros/host/*/manifest.json)/health

# Talk to pty-daemon over its Unix socket
ls -la ~/Library/Application\ Support/Choros/pty/
```
