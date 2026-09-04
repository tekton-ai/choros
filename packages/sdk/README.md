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
await client.automations.list();

// Trigger an automation now (off-schedule)
await client.automations.run('<automation-id>');
```

Both `apiKey` and `organizationId` are picked up automatically from `CHOROS_API_KEY` / `CHOROS_ORGANIZATION_ID` environment variables — you can omit them in the constructor.

Find your `organizationId` via `choros organization list` in the CLI, or in the URL of any org dashboard.

## Configuration

```ts
const client = new Choros({
  apiKey: 'sk_live_…',
  organizationId: '…',
  baseURL: 'https://api.choros.sh',     // override for staging / self-hosted
  relayURL: 'https://relay.choros.sh',  // host-routed ops (workspace create, automation run)
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
