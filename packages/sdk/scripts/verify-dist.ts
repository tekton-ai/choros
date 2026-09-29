import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const consumer = mkdtempSync(join(tmpdir(), "choros-sdk-consumer-"));

function run(command: string, args: string[]): void {
	execFileSync(command, args, { cwd: consumer, stdio: "inherit" });
}

try {
	const packed = JSON.parse(
		execFileSync(
			"npm",
			["pack", "--json", "--ignore-scripts", "--pack-destination", consumer],
			{ cwd: dist, encoding: "utf8" },
		),
	) as Array<{ filename: string }>;
	const archive = packed[0]?.filename;
	if (!archive) throw new Error("SDK packaging did not return a tarball");
	writeFileSync(
		join(consumer, "package.json"),
		`${JSON.stringify(
			{
				private: true,
				type: "module",
				dependencies: { "@choros_sh/sdk": `file:${join(consumer, archive)}` },
				devDependencies: { typescript: "6.0.3" },
			},
			null,
			2,
		)}\n`,
	);
	writeFileSync(
		join(consumer, "tsconfig.json"),
		`${JSON.stringify(
			{
				compilerOptions: {
					lib: ["ES2022", "DOM"],
					module: "NodeNext",
					moduleResolution: "NodeNext",
					noEmit: true,
					strict: true,
					types: [],
				},
				include: ["consumer.ts"],
			},
			null,
			2,
		)}\n`,
	);
	writeFileSync(
		join(consumer, "consumer.ts"),
		`import {
  createLocalHostClient,
  type AutomationDefinitionInput,
  type AutomationPreview,
  type AutomationRun,
} from "@choros_sh/sdk";

const client = createLocalHostClient({
  endpoint: "http://127.0.0.1:4317",
  auth: () => ({ token: "consumer-token", clientMachineId: "consumer-machine" }),
});
const definition: AutomationDefinitionInput = {
  name: "dist consumer",
  instructions: "inspect the SDK declaration contract",
  target: { kind: "existingWorkspace", workspaceId: "00000000-0000-4000-8000-000000000000" },
  executor: { harness: "codex", accountRef: "consumer-account" },
  schedule: { kind: "immediate" },
};
const preview: Promise<AutomationPreview> = client.automations.preview.query({
  definition,
  intent: "save",
});
const cancellation: Promise<AutomationRun> = client.executions.requestCancel.mutate({
  requestId: "consumer-request",
  runId: "00000000-0000-4000-8000-000000000001",
});
void preview;
void cancellation;
`,
	);
	writeFileSync(
		join(consumer, "transport.ts"),
		`import { strict as assert } from "node:assert";
import { createLocalHostClient } from "@choros_sh/sdk";

type CapturedRequest = { method: string; body: string };
let receiveRequest: ((request: CapturedRequest) => void) | undefined;
const received = new Promise<CapturedRequest>((resolve) => {
  receiveRequest = resolve;
});
const server = Bun.serve({
  port: 0,
  async fetch(request) {
    receiveRequest?.({ method: request.method, body: await request.text() });
    return Response.json([{ result: { data: { json: { accepted: true } } } }]);
  },
});

try {
  const client = createLocalHostClient({
    endpoint: server.url.toString(),
    auth: () => ({ token: "transport-token" }),
  });
  const query = client.automations.preview.query({
    definition: {
      name: "long transport query",
      instructions: "x".repeat(65_536),
      target: {
        kind: "existingWorkspace",
        workspaceId: "00000000-0000-4000-8000-000000000000",
      },
      executor: { harness: "codex", accountRef: "transport-account" },
      schedule: { kind: "immediate" },
    },
    intent: "save",
  }, { signal: AbortSignal.timeout(10_000) });
  const request = await Promise.race([
    received,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("No SDK HTTP request received")), 5_000),
    ),
  ]);
  const body = request.body;
  assert.equal(request.method, "POST");
  assert.ok(body.length > 65_536, "long query must be carried in the POST body");
  await query;
} finally {
  server.stop(true);
}
`,
	);

	run("bun", ["install", "--ignore-scripts"]);
	run(join(consumer, "node_modules/.bin/tsc"), ["-p", "tsconfig.json"]);
	run("bun", ["transport.ts"]);
} finally {
	rmSync(consumer, { recursive: true, force: true });
}
