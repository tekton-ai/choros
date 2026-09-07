import { describe, expect, test } from "bun:test";
import {
	dispatchLockstep,
	type GitHub,
	GitHubClient,
	GitHubError,
	type LocalAsset,
	publishVersioned,
	type Release,
	type RemoteAsset,
	resolveTag,
	updateCliLatest,
} from "./github-release.ts";

const SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
const TAG = "cli-v1.2.3";

function asset(name: string, bytes = name): LocalAsset {
	const blob = new Blob([bytes]);
	return {
		name,
		size: blob.size,
		digest: `sha256:${Bun.SHA256.hash(bytes, "hex")}`,
		open: () => blob,
	};
}

const files = [
	asset("choros-linux-x64.tar.gz"),
	asset("choros-darwin-arm64.tar.gz"),
];

// Stateful GitHub boundary: real release functions drive tags, drafts and bytes.
// Faults can happen after commit, just like a lost HTTP response.
class FakeGitHub implements GitHub {
	tags = new Map<string, string>([[TAG, SHA]]);
	tagObjects = new Map<string, { type: string; sha: string }>();
	releases = new Map<number, Release>();
	assets = new Map<
		number,
		{ releaseId: number; remote: RemoteAsset; bytes: Blob }
	>();
	dispatches: string[] = [];
	fault?: { operation: string; status: number; after?: boolean };
	#nextId = 1;

	release(tag: string): Release | undefined {
		return [...this.releases.values()].find((entry) => entry.tag_name === tag);
	}

	asset(tag: string, name: string) {
		return [...this.assets.values()].find(
			(entry) =>
				entry.releaseId === this.release(tag)?.id && entry.remote.name === name,
		);
	}

	async #attempt<T>(
		operation: string,
		action: () => T | Promise<T>,
	): Promise<T> {
		const fault = this.fault?.operation === operation ? this.fault : undefined;
		if (fault) this.fault = undefined;
		if (fault && !fault.after)
			throw new GitHubError(fault.status, `Injected ${operation}`);
		const result = await action();
		if (fault)
			throw new GitHubError(fault.status, `Lost response: ${operation}`);
		return result;
	}

	async request<T>(method: string, path: string, body?: unknown): Promise<T> {
		return this.#attempt(`${method} ${path}`, () => {
			const data = body as Record<string, unknown>;
			const parts = path.split("/");
			let result: unknown;
			if (method === "GET" && path.startsWith("git/ref/tags/")) {
				const sha = this.tags.get(
					decodeURIComponent(path.slice("git/ref/tags/".length)),
				);
				if (!sha) throw new GitHubError(404, "Missing tag");
				result = {
					object: { type: this.tagObjects.has(sha) ? "tag" : "commit", sha },
				};
			} else if (method === "GET" && path.startsWith("git/tags/")) {
				const object = this.tagObjects.get(parts[2]);
				if (!object) throw new GitHubError(404, "Missing tag object");
				result = { object };
			} else if (method === "POST" && path === "git/refs") {
				const tag = (data.ref as string).slice("refs/tags/".length);
				if (this.tags.has(tag))
					throw new GitHubError(422, "Tag already exists");
				this.tags.set(tag, data.sha as string);
			} else if (method === "PATCH" && path === "git/refs/tags/cli-latest") {
				if (!this.tags.has("cli-latest"))
					throw new GitHubError(404, "Missing pointer tag");
				this.tags.set("cli-latest", data.sha as string);
			} else if (method === "GET" && path.startsWith("releases/tags/")) {
				const release = this.release(decodeURIComponent(parts[2]));
				if (!release || release.draft)
					throw new GitHubError(404, "Missing published release");
				result = release;
			} else if (method === "GET" && path.startsWith("releases?")) {
				const page = Number(
					new URLSearchParams(path.split("?")[1]).get("page"),
				);
				result = [...this.releases.values()].slice(
					(page - 1) * 100,
					page * 100,
				);
			} else if (method === "POST" && path === "releases/generate-notes") {
				result = { body: "Generated changelog" };
			} else if (method === "POST" && path === "releases") {
				if (this.release(data.tag_name as string))
					throw new GitHubError(422, "Release already exists");
				const release = {
					id: this.#nextId++,
					tag_name: data.tag_name as string,
					body: data.body as string,
					draft: data.draft as boolean,
					prerelease: data.prerelease as boolean,
				};
				this.releases.set(release.id, release);
				result = release;
			} else if (method === "PATCH" && /^releases\/\d+$/.test(path)) {
				const release = this.releases.get(Number(parts[1]));
				if (!release) throw new GitHubError(404, "Missing release");
				Object.assign(release, data);
				result = release;
			} else if (method === "GET" && /^releases\/\d+\/assets\?/.test(path)) {
				const page = Number(
					new URLSearchParams(path.split("?")[1]).get("page"),
				);
				result = [...this.assets.values()]
					.filter((entry) => entry.releaseId === Number(parts[1]))
					.map((entry) => entry.remote)
					.slice((page - 1) * 100, page * 100);
			} else if (method === "DELETE" && path.startsWith("releases/assets/")) {
				if (!this.assets.delete(Number(parts[2])))
					throw new GitHubError(404, "Missing asset");
			} else if (
				method === "POST" &&
				path === "actions/workflows/release-cli.yml/dispatches"
			) {
				this.dispatches.push(data.ref as string);
			} else throw new Error(`Unexpected GitHub operation: ${method} ${path}`);
			return structuredClone(result) as T;
		});
	}

	async upload(releaseId: number, file: LocalAsset): Promise<RemoteAsset> {
		const release = this.releases.get(releaseId);
		return this.#attempt(`upload ${release?.tag_name}/${file.name}`, () => {
			if (!release) throw new GitHubError(404, "Missing upload release");
			if (this.asset(release.tag_name, file.name))
				throw new GitHubError(422, "Asset already exists");
			const remote = {
				id: this.#nextId++,
				name: file.name,
				size: file.size,
				state: "uploaded",
				digest: file.digest,
			};
			this.assets.set(remote.id, { releaseId, remote, bytes: file.open() });
			return structuredClone(remote);
		});
	}

	async copy(releaseId: number, remote: RemoteAsset): Promise<RemoteAsset> {
		const entry = this.assets.get(remote.id);
		if (!entry) throw new GitHubError(404, "Missing source asset");
		return this.upload(releaseId, {
			name: remote.name,
			size: remote.size,
			digest: await this.digest(remote),
			open: () => entry.bytes,
		});
	}

	async digest(remote: RemoteAsset): Promise<string> {
		const entry = this.assets.get(remote.id);
		if (!entry) throw new GitHubError(404, "Missing digest asset");
		return `sha256:${Bun.SHA256.hash(await entry.bytes.arrayBuffer(), "hex")}`;
	}

	async text(remote: RemoteAsset): Promise<string> {
		const entry = this.assets.get(remote.id);
		if (!entry) throw new GitHubError(404, "Missing text asset");
		return entry.bytes.text();
	}
}

function publish(github: FakeGitHub, tag = TAG, sha = SHA, assets = files) {
	return publishVersioned(github, { stream: "cli", tag, sha, assets });
}

async function servedVersion(github: FakeGitHub): Promise<string | undefined> {
	return (
		await github.asset("cli-latest", "version.txt")?.bytes.text()
	)?.trim();
}

describe("versioned release recovery", () => {
	test("lost creation response resumes the same draft and publishes only complete assets", async () => {
		const github = new FakeGitHub();
		github.fault = { operation: "POST releases", status: 502, after: true };
		await expect(publish(github)).rejects.toThrow("Lost response");
		const draft = github.release(TAG);
		if (!draft) throw new Error("Expected retained draft");
		expect(draft?.draft).toBe(true);
		await expect(updateCliLatest(github, TAG, SHA)).rejects.toThrow(
			"not published",
		);
		const completed = await publish(github);
		expect(completed.id).toBe(draft.id);
		expect(completed.draft).toBe(false);
		expect(completed.prerelease).toBe(true);
		for (const file of files)
			expect(await github.asset(TAG, file.name)?.bytes.text()).toBe(file.name);
	});

	test("lost upload response skips committed bytes and fills the missing asset", async () => {
		const github = new FakeGitHub();
		github.fault = {
			operation: `upload ${TAG}/${files[0].name}`,
			status: 502,
			after: true,
		};
		await expect(publish(github)).rejects.toThrow("Lost response");
		const retained = github.asset(TAG, files[0].name)?.remote.id;
		expect(github.release(TAG)?.draft).toBe(true);
		await publish(github);
		expect(github.asset(TAG, files[0].name)?.remote.id).toBe(retained);
		expect(await github.asset(TAG, files[1].name)?.bytes.text()).toBe(
			files[1].name,
		);
	});

	test("replaces a failed starter but refuses rebuilt bytes for a missing original artifact", async () => {
		const github = new FakeGitHub();
		github.fault = {
			operation: `upload ${TAG}/${files[0].name}`,
			status: 502,
			after: true,
		};
		await expect(publish(github)).rejects.toThrow();
		const starter = github.asset(TAG, files[0].name);
		if (!starter) throw new Error("Expected interrupted asset");
		starter.remote.state = "starter";
		starter.remote.size = 0;
		starter.bytes = new Blob();
		await expect(
			publish(github, TAG, SHA, [asset(files[0].name, "rebuilt"), files[1]]),
		).rejects.toThrow("Original artifact required");
		expect(starter.remote.state).toBe("starter");
		await publish(github);
		expect(await github.asset(TAG, files[0].name)?.bytes.text()).toBe(
			files[0].name,
		);
	});

	test("a complete release keeps original assets despite same-SHA nondeterministic rebuilds", async () => {
		const github = new FakeGitHub();
		const original = await publish(github);
		const stored = github.releases.get(original.id);
		if (!stored) throw new Error("Expected published release");
		stored.body = `Maintainer notes\n${original.body}`;
		const rebuilt = files.map((file) => asset(file.name, "new timestamp"));
		const resumed = await publish(github, TAG, SHA, rebuilt);
		expect(resumed.id).toBe(original.id);
		expect(resumed.draft).toBe(false);
		expect(resumed.body?.startsWith("Maintainer notes")).toBe(true);
		await updateCliLatest(github, TAG, SHA);
		for (const file of files)
			expect(await github.asset("cli-latest", file.name)?.bytes.text()).toBe(
				file.name,
			);
	});

	test("desktop retries never redraft an already published release or overwrite its notes", async () => {
		const github = new FakeGitHub();
		const tag = "desktop-v1.2.3";
		github.tags.set(tag, SHA);
		const options = {
			stream: "desktop" as const,
			tag,
			sha: SHA,
			assets: files,
			notes: "Reviewed notes",
		};
		const draft = await publishVersioned(github, options);
		expect(draft.draft).toBe(true);
		await github.request("PATCH", `releases/${draft.id}`, { draft: false });
		const resumed = await publishVersioned(github, {
			...options,
			notes: "Regenerated notes",
		});
		expect(resumed.draft).toBe(false);
		expect(resumed.body).toBe(draft.body);
	});

	test("moved tags and tampered release assets are never overwritten", async () => {
		const github = new FakeGitHub();
		await publish(github);
		github.tags.set(TAG, OTHER_SHA);
		await expect(publish(github)).rejects.toThrow("SHA conflict");
		await expect(publish(github, TAG, OTHER_SHA)).rejects.toThrow(
			"provenance conflict",
		);
		github.tags.set(TAG, SHA);
		const remote = github.asset(TAG, files[0].name);
		if (!remote) throw new Error("Expected published asset");
		remote.bytes = new Blob(["tampered"]);
		await expect(publish(github)).rejects.toThrow("Asset conflict");
		expect(await remote.bytes.text()).toBe("tampered");
	});

	test("historical releases without provenance fail closed", async () => {
		const github = new FakeGitHub();
		const original = await publish(github);
		const stored = github.releases.get(original.id);
		if (!stored) throw new Error("Expected published release");
		stored.body = "Old release without ownership metadata";
		await expect(publish(github)).rejects.toThrow("inspect it manually");
		expect(github.release(TAG)?.draft).toBe(false);
	});
});

describe("lockstep recovery", () => {
	test("tag creation followed by failed dispatch is recoverable without moving the tag", async () => {
		const github = new FakeGitHub();
		github.tags.delete(TAG);
		github.tags.set("desktop-v1.2.3", SHA);
		github.fault = {
			operation: "POST actions/workflows/release-cli.yml/dispatches",
			status: 503,
		};
		await expect(
			dispatchLockstep(github, "desktop-v1.2.3", SHA),
		).rejects.toThrow("Injected");
		expect(github.tags.get(TAG)).toBe(SHA);
		expect(await dispatchLockstep(github, "desktop-v1.2.3", SHA)).toBe(
			"dispatched",
		);
		expect(github.dispatches).toEqual([TAG]);
		await publish(github);
		await updateCliLatest(github, TAG, SHA);
		expect(await dispatchLockstep(github, "desktop-v1.2.3", SHA)).toBe(
			"complete",
		);
		expect(github.dispatches).toEqual([TAG]);
	});

	test("a published CLI release redispatches until its failed rolling update finishes", async () => {
		const github = new FakeGitHub();
		github.tags.set("desktop-v1.2.3", SHA);
		const published = await publish(github);
		github.fault = {
			operation: `upload cli-latest/${files[0].name}`,
			status: 502,
		};
		await expect(updateCliLatest(github, TAG, SHA)).rejects.toThrow("Injected");
		const pending = structuredClone(github.release("cli-latest"));
		expect(await dispatchLockstep(github, "desktop-v1.2.3", SHA)).toBe(
			"dispatched",
		);
		expect(github.dispatches).toEqual([TAG]);
		expect(github.release("cli-latest")).toEqual(pending);
		expect((await publish(github)).id).toBe(published.id);
		await updateCliLatest(github, TAG, SHA);
		expect(await dispatchLockstep(github, "desktop-v1.2.3", SHA)).toBe(
			"complete",
		);
		expect(github.dispatches).toEqual([TAG]);
		expect(await servedVersion(github)).toBe("1.2.3");
	});

	test("a CLI hotfix at a different SHA blocks lockstep and preserves ownership", async () => {
		const github = new FakeGitHub();
		github.tags.set("desktop-v1.2.3", OTHER_SHA);
		await expect(
			dispatchLockstep(github, "desktop-v1.2.3", OTHER_SHA),
		).rejects.toThrow("preserve the CLI hotfix");
		expect(github.tags.get(TAG)).toBe(SHA);
		expect(github.dispatches).toEqual([]);
	});

	test("annotated tags are compared by commit, including nested tags", async () => {
		const github = new FakeGitHub();
		const object = "c".repeat(40);
		github.tagObjects.set(object, { type: "tag", sha: "d".repeat(40) });
		github.tagObjects.set("d".repeat(40), { type: "commit", sha: SHA });
		github.tags.set("desktop-v1.2.3", object);
		expect(await dispatchLockstep(github, "desktop-v1.2.3", SHA)).toBe(
			"dispatched",
		);
		expect(github.tags.get(TAG)).toBe(SHA);
	});
});

describe("rolling pointer recovery", () => {
	test("an interrupted newer update keeps a durable rollback floor and resumes in place", async () => {
		const github = new FakeGitHub();
		github.tags.set("desktop-v1.2.3", SHA);
		await publish(github);
		await updateCliLatest(github, TAG, SHA);
		const pointer = github.release("cli-latest");
		if (!pointer) throw new Error("Expected rolling release");
		const pointerId = pointer.id;
		const newer = "cli-v1.2.10";
		github.tags.set(newer, OTHER_SHA);
		await publish(
			github,
			newer,
			OTHER_SHA,
			files.map((file) => asset(file.name, "new version")),
		);
		github.fault = {
			operation: `upload cli-latest/${files[0].name}`,
			status: 502,
		};
		await expect(updateCliLatest(github, newer, OTHER_SHA)).rejects.toThrow(
			"Injected",
		);
		expect(await dispatchLockstep(github, "desktop-v1.2.3", SHA)).toBe(
			"dispatched",
		);
		expect(await updateCliLatest(github, TAG, SHA)).toBe(false);
		expect(await updateCliLatest(github, newer, OTHER_SHA)).toBe(true);
		expect(github.release("cli-latest")?.id).toBe(pointerId);
		expect(await servedVersion(github)).toBe("1.2.10");
		expect(github.tags.get("cli-latest")).toBe(OTHER_SHA);
		expect(await updateCliLatest(github, TAG, SHA)).toBe(false);
		expect(await servedVersion(github)).toBe("1.2.10");
		expect(await dispatchLockstep(github, "desktop-v1.2.3", SHA)).toBe(
			"complete",
		);
		expect(github.dispatches).toEqual([TAG]);
	});

	test("first pointer creation can lose its response and still recover without deleting it", async () => {
		const github = new FakeGitHub();
		await publish(github);
		github.fault = { operation: "POST releases", status: 502, after: true };
		await expect(updateCliLatest(github, TAG, SHA)).rejects.toThrow(
			"Lost response",
		);
		const pointer = github.release("cli-latest");
		if (!pointer) throw new Error("Expected retained rolling draft");
		const id = pointer.id;
		await updateCliLatest(github, TAG, SHA);
		expect(github.release("cli-latest")?.id).toBe(id);
		expect(github.release("cli-latest")?.draft).toBe(false);
		expect(await servedVersion(github)).toBe("1.2.3");
	});

	test("delete failures stop replacement, then rerun safely completes", async () => {
		const github = new FakeGitHub();
		await publish(github);
		await updateCliLatest(github, TAG, SHA);
		const original = github.asset("cli-latest", files[0].name);
		if (!original) throw new Error("Expected original rolling asset");
		github.tags.set("cli-v1.2.4", OTHER_SHA);
		await publish(
			github,
			"cli-v1.2.4",
			OTHER_SHA,
			files.map((file) => asset(file.name, "new version")),
		);
		github.fault = {
			operation: `DELETE releases/assets/${original.remote.id}`,
			status: 403,
		};
		await expect(
			updateCliLatest(github, "cli-v1.2.4", OTHER_SHA),
		).rejects.toThrow("Injected");
		expect(await original.bytes.text()).toBe(files[0].name);
		await updateCliLatest(github, "cli-v1.2.4", OTHER_SHA);
		expect(await servedVersion(github)).toBe("1.2.4");
	});

	test("API failure reading an existing pointer cannot be treated as first publication", async () => {
		const github = new FakeGitHub();
		await publish(github);
		await updateCliLatest(github, TAG, SHA);
		github.fault = { operation: "GET releases/tags/cli-latest", status: 503 };
		await expect(updateCliLatest(github, TAG, SHA)).rejects.toThrow("Injected");
		expect(await servedVersion(github)).toBe("1.2.3");
		expect(github.tags.get("cli-latest")).toBe(SHA);
	});
});

describe("GitHub HTTP error boundary", () => {
	test("only actual 404 means absence; a 403 with Not Found text remains an error", async () => {
		const missing = new GitHubClient(
			"owner/repo",
			"test",
			async () => new Response("Not Found", { status: 404 }),
		);
		expect(await resolveTag(missing, TAG)).toBeUndefined();
		const denied = new GitHubClient(
			"owner/repo",
			"test",
			async () => new Response("Not Found", { status: 403 }),
		);
		await expect(resolveTag(denied, TAG)).rejects.toBeInstanceOf(GitHubError);
		await expect(
			dispatchLockstep(denied, "desktop-v1.2.3", SHA),
		).rejects.toThrow("403");
	});
});
