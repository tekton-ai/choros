# Choros TypeScript SDK

Typed wrapper around the Choros API. See the [Choros documentation](https://tekton-ai.github.io/choros/docs) for the supported product surface.

## Install

```bash
npm install @choros_sh/sdk
# or: bun add @choros_sh/sdk
```

## Quickstart

```ts
import Choros from '@choros_sh/sdk';

const client = new Choros({
  apiKey: process.env.CHOROS_API_KEY,             // sk_live_…
  organizationId: process.env.CHOROS_ORGANIZATION_ID, // required for most resources
});

// Tasks
const task = await client.tasks.create({ title: 'Wire up auth', priority: 'high' });
const mine = await client.tasks.list({ assigneeMe: true, priority: 'high' });
const got  = await client.tasks.retrieve('SUPER-172'); // Task | null
await client.tasks.update({ id: task.id, statusId: '<uuid>' });
await client.tasks.delete(task.id);

// Hosts own workspaces and projects — pick a host, then read from it
const [host] = await client.hosts.list();
if (!host) throw new Error('No hosts registered — run `choros start` on a machine');
await client.workspaces.list({ hostId: host.id });
await client.projects.list({ hostId: host.id });
```

Both `apiKey` and `organizationId` are picked up automatically from `CHOROS_API_KEY` / `CHOROS_ORGANIZATION_ID` environment variables — you can omit them in the constructor.

Find your `organizationId` via `choros organization list` in the CLI, or in the URL of any org dashboard.

## Local Host Automations

Automations live on one explicitly selected local Host. They are not an
organization-scoped cloud resource and do not use the relay transport. Build a
typed local client from a Host endpoint and an authentication provider:

```ts
import { createLocalHostClient } from '@choros_sh/sdk';

const local = createLocalHostClient({
  endpoint: process.env.CHOROS_HOST_ENDPOINT!,
  auth: async () => ({
    token: await loadCurrentHostToken(),
    clientMachineId: process.env.CHOROS_MACHINE_ID,
  }),
});

const preview = await local.automations.preview.query({
  definition,
  intent: 'save',
});

// Show preview.summary to the user and obtain explicit confirmation first.
const saved = await local.automations.create.mutate({
  requestId: crypto.randomUUID(),
  confirmationToken: preview.confirmationToken,
  runImmediately: false,
});
```

Creation saves the Automation paused. Enabling is a separate confirmed call:
preview the same current definition with `intent: 'enable'`, then pass that
preview's token and the current `expectedVersion` to
`automations.setScheduleState`. Do not persist confirmation tokens or treat a
successful request as proof that an agent finished its work.

The local client exposes the public `automations` and `executions` procedures,
not Host implementation types. Its published declarations include the shared
Automation contracts and do not require private `@choros/*` packages. Queries
use POST so the supported 64 KiB instructions payload does not enter the URL.

For SDK maintainers, run `bun run build && bun run verify:dist` in this package.
The verification packs the distributable, installs that tarball into an empty
temporary project, checks it with strict TypeScript/NodeNext, and exercises a
64 KiB query over HTTP. It does not publish a package or start an agent.

## Configuration

```ts
const client = new Choros({
  apiKey: 'sk_live_…',
  organizationId: '…',
  baseURL: 'https://api.choros.sh',     // override for staging / self-hosted
  relayURL: 'https://relay.choros.sh',  // host-routed workspace/agent operations
  timeout: 60_000,
  maxRetries: 2,
  logLevel: 'warn',                       // 'off' | 'error' | 'warn' | 'info' | 'debug'
});
```

Keys starting with `sk_live_` or `sk_test_` are sent as `x-api-key`; anything else as `Authorization: Bearer <token>`.

## Errors

```ts
import { APIError, NotFoundError, RateLimitError } from '@choros_sh/sdk';

try {
  await client.tasks.create({ title: '' });
} catch (err) {
  if (err instanceof RateLimitError) { /* 429 — already retried up to maxRetries */ }
  if (err instanceof APIError)       { /* err.status, err.headers, err.error (parsed body) */ }
}
```

## Two transport paths

Most methods hit `api.choros.sh` directly. Workspace, project, agent, and terminal operations physically execute on a developer machine and route through the relay tunnel to the host named by `hostId`: `workspaces.list/create/update/delete`, `projects.list`, `agents.list/create`, and `terminals.create`. The SDK transparently exchanges your API key for a short-lived JWT to talk to the relay — no token plumbing required.

For relay-bound calls, the target host has to be online and tunneling, otherwise you'll get a `503 Host not connected`.

## License

Apache-2.0
