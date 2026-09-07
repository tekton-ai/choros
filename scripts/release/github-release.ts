import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface AssetSpec {
	name: string;
	size: number;
	digest: string;
}

export interface LocalAsset extends AssetSpec {
	open(): Blob;
}

export interface RemoteAsset {
	id: number;
	name: string;
	size: number;
	state: string;
	digest?: string | null;
}

export interface Release {
	id: number;
	tag_name: string;
	body: string | null;
	draft: boolean;
	prerelease: boolean;
}

interface ReleaseState {
	format: 1;
	tag: string;
	sha: string;
	phase: "pending" | "complete";
	assets: AssetSpec[];
}

// This is the only external boundary; tests exercise recovery without credentials.
export interface GitHub {
	request<T>(method: string, path: string, body?: unknown): Promise<T>;
	upload(releaseId: number, asset: LocalAsset): Promise<RemoteAsset>;
	copy(releaseId: number, asset: RemoteAsset): Promise<RemoteAsset>;
	digest(asset: RemoteAsset): Promise<string>;
	text(asset: RemoteAsset): Promise<string>;
}

export class GitHubError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

async function optional<T>(read: () => Promise<T>): Promise<T | undefined> {
	try {
		return await read();
	} catch (error) {
		if (error instanceof GitHubError && error.status === 404) return undefined;
		throw error;
	}
}

function version(tag: string, stream: "cli" | "desktop" = "cli"): string {
	const value = tag.slice(`${stream}-v`.length);
	if (
		!tag.startsWith(`${stream}-v`) ||
		!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) ||
		!Bun.semver.satisfies(value, "*")
	) {
		throw new Error(`Invalid ${stream} release tag: ${tag}`);
	}
	return value;
}

function assertSha(sha: string): void {
	if (!/^[a-f0-9]{40}$/.test(sha))
		throw new Error(`Invalid commit SHA: ${sha}`);
}

export async function resolveTag(
	github: GitHub,
	tag: string,
): Promise<string | undefined> {
	let ref = await optional(() =>
		github.request<{ object: { type: string; sha: string } }>(
			"GET",
			`git/ref/tags/${encodeURIComponent(tag)}`,
		),
	);
	if (!ref) return undefined;
	const seen = new Set<string>();
	while (ref.object.type === "tag") {
		if (seen.has(ref.object.sha)) throw new Error(`Cyclic tag: ${tag}`);
		seen.add(ref.object.sha);
		ref = await github.request<{ object: { type: string; sha: string } }>(
			"GET",
			`git/tags/${ref.object.sha}`,
		);
	}
	if (ref.object.type !== "commit")
		throw new Error(`Tag is not a commit: ${tag}`);
	assertSha(ref.object.sha);
	return ref.object.sha;
}

async function assertTag(
	github: GitHub,
	tag: string,
	sha: string,
): Promise<void> {
	assertSha(sha);
	const actual = await resolveTag(github, tag);
	if (actual !== sha) {
		throw new Error(
			`${tag} SHA conflict: expected ${sha}, found ${actual ?? "missing"}; never move a versioned tag`,
		);
	}
}

const MARKER = /<!-- choros-release-state:(.*?) -->/g;

function readState(release: Release): ReleaseState {
	const matches = [...(release.body ?? "").matchAll(MARKER)];
	if (matches.length !== 1) {
		throw new Error(
			`${release.tag_name} has no unique release provenance; inspect it manually, do not overwrite it`,
		);
	}
	const state = JSON.parse(matches[0][1]) as ReleaseState;
	if (
		state.format !== 1 ||
		typeof state.tag !== "string" ||
		typeof state.sha !== "string" ||
		!(["pending", "complete"] as const).includes(state.phase) ||
		!Array.isArray(state.assets) ||
		state.assets.length === 0 ||
		state.assets.some(
			(asset) =>
				typeof asset.name !== "string" ||
				!asset.name ||
				!Number.isSafeInteger(asset.size) ||
				asset.size <= 0 ||
				!/^sha256:[a-f0-9]{64}$/.test(asset.digest),
		) ||
		new Set(state.assets.map((asset) => asset.name)).size !==
			state.assets.length
	) {
		throw new Error(`Invalid release provenance: ${release.tag_name}`);
	}
	assertSha(state.sha);
	return state;
}

function withState(body: string | null, state: ReleaseState): string {
	return `${(body ?? "").replace(MARKER, "").trim()}\n\n<!-- choros-release-state:${JSON.stringify(state)} -->`;
}

async function releaseFor(
	github: GitHub,
	tag: string,
): Promise<Release | undefined> {
	const published = await optional(() =>
		github.request<Release>("GET", `releases/tags/${encodeURIComponent(tag)}`),
	);
	if (published) return published;
	// The tag endpoint only guarantees published releases; list includes our drafts.
	let found: Release | undefined;
	for (let page = 1; ; page++) {
		const releases = await github.request<Release[]>(
			"GET",
			`releases?per_page=100&page=${page}`,
		);
		for (const release of releases) {
			if (release.tag_name !== tag) continue;
			if (found)
				throw new Error(`Multiple releases claim ${tag}; inspect manually`);
			found = release;
		}
		if (releases.length < 100) return found;
	}
}

async function assetsFor(
	github: GitHub,
	release: Release,
): Promise<RemoteAsset[]> {
	const assets: RemoteAsset[] = [];
	for (let page = 1; ; page++) {
		const batch = await github.request<RemoteAsset[]>(
			"GET",
			`releases/${release.id}/assets?per_page=100&page=${page}`,
		);
		assets.push(...batch);
		if (batch.length < 100) return assets;
	}
}

async function matchesAsset(
	github: GitHub,
	asset: RemoteAsset,
	expected: AssetSpec,
): Promise<boolean> {
	return (
		asset.state === "uploaded" &&
		asset.size === expected.size &&
		(await github.digest(asset)) === expected.digest
	);
}

function assertSource(state: ReleaseState, tag: string, sha: string): void {
	if (state.tag !== tag || state.sha !== sha) {
		throw new Error(
			`Release provenance conflict for ${tag}: recorded ${state.tag} at ${state.sha}, expected ${sha}`,
		);
	}
}

async function verifiedAssets(
	github: GitHub,
	release: Release,
	state: ReleaseState,
): Promise<RemoteAsset[]> {
	const assets = await assetsFor(github, release);
	if (assets.length !== state.assets.length)
		throw new Error(`Incomplete assets: ${release.tag_name}`);
	for (const expected of state.assets) {
		const asset = assets.find((entry) => entry.name === expected.name);
		if (!asset || !(await matchesAsset(github, asset, expected))) {
			throw new Error(
				`Incomplete or conflicting asset: ${release.tag_name}/${expected.name}`,
			);
		}
	}
	return assets;
}

export async function publishVersioned(
	github: GitHub,
	options: {
		stream: "cli" | "desktop";
		tag: string;
		sha: string;
		assets: LocalAsset[];
		notes?: string;
	},
): Promise<Release> {
	const { stream, tag, sha, assets, notes } = options;
	version(tag, stream);
	await assertTag(github, tag, sha);
	if (
		!assets.length ||
		new Set(assets.map((asset) => asset.name)).size !== assets.length
	) {
		throw new Error("Release requires a nonempty, unique asset set");
	}
	let release = await releaseFor(github, tag);
	if (!release) {
		const body =
			notes ??
			(
				await github.request<{ body: string }>(
					"POST",
					"releases/generate-notes",
					{ tag_name: tag },
				)
			).body;
		const state: ReleaseState = {
			format: 1,
			tag,
			sha,
			phase: "pending",
			assets: assets.map(({ name, size, digest }) => ({ name, size, digest })),
		};
		release = await github.request<Release>("POST", "releases", {
			tag_name: tag,
			target_commitish: sha,
			name: `Choros ${stream === "cli" ? "CLI" : "Desktop"} ${tag}`,
			body: withState(body, state),
			draft: true,
			prerelease: stream === "cli",
			...(stream === "cli" ? { make_latest: "false" } : {}),
		});
	}
	const state = readState(release);
	assertSource(state, tag, sha);
	if (release.prerelease !== (stream === "cli"))
		throw new Error(`Unexpected release channel: ${tag}`);
	if (
		assets.length !== state.assets.length ||
		assets.some(
			(asset) => !state.assets.some((expected) => expected.name === asset.name),
		)
	) {
		throw new Error(
			`Asset inventory changed for ${tag}; rerun failed jobs with the original build artifacts`,
		);
	}
	const remote = await assetsFor(github, release);
	if (
		remote.some(
			(asset) => !state.assets.some((expected) => expected.name === asset.name),
		)
	) {
		throw new Error(`Unowned assets on ${tag}; inspect manually`);
	}
	for (const expected of state.assets) {
		const existing = remote.find((asset) => asset.name === expected.name);
		if (existing && (await matchesAsset(github, existing, expected))) continue;
		// A failed GitHub upload may leave an empty starter. Never clobber uploaded bytes.
		if (existing && existing.state !== "starter")
			throw new Error(`Asset conflict: ${tag}/${expected.name}`);
		const local = assets.find((asset) => asset.name === expected.name);
		if (
			!local ||
			local.digest !== expected.digest ||
			local.size !== expected.size
		) {
			throw new Error(
				`Original artifact required: ${tag}/${expected.name}; rerun failed jobs, not all builds`,
			);
		}
		if (existing)
			await github.request("DELETE", `releases/assets/${existing.id}`);
		await github.upload(release.id, local);
	}
	await verifiedAssets(github, release, state);
	await assertTag(github, tag, sha);
	if (state.phase !== "complete" || (stream === "cli" && release.draft)) {
		release = await github.request<Release>("PATCH", `releases/${release.id}`, {
			body: withState(release.body, { ...state, phase: "complete" }),
			...(stream === "cli"
				? { draft: false, prerelease: true, make_latest: "false" }
				: {}),
		});
	}
	return release;
}

export async function dispatchLockstep(
	github: GitHub,
	desktopTag: string,
	sha: string,
): Promise<"dispatched" | "complete"> {
	const cliTag = `cli-v${version(desktopTag, "desktop")}`;
	await assertTag(github, desktopTag, sha);
	const existing = await resolveTag(github, cliTag);
	if (existing && existing !== sha) {
		throw new Error(
			`${cliTag} is already owned by ${existing}, not desktop ${sha}; preserve the CLI hotfix and choose a new unified version`,
		);
	}
	if (!existing)
		await github.request("POST", "git/refs", {
			ref: `refs/tags/${cliTag}`,
			sha,
		});
	await assertTag(github, cliTag, sha);
	const release = await releaseFor(github, cliTag);
	if (release) {
		const state = readState(release);
		assertSource(state, cliTag, sha);
		if (!release.prerelease)
			throw new Error(`Unexpected release channel: ${cliTag}`);
		if (!release.draft && state.phase === "complete") {
			await verifiedAssets(github, release, state);
			const pointer = await releaseFor(github, "cli-latest");
			if (pointer && !pointer.draft) {
				if (!pointer.prerelease)
					throw new Error("cli-latest must remain a prerelease");
				const pointerState = readState(pointer);
				if (
					pointerState.phase === "complete" &&
					Bun.semver.order(version(pointerState.tag), version(cliTag)) >= 0
				) {
					if (pointerState.tag === cliTag)
						assertSource(pointerState, cliTag, sha);
					await assertTag(github, pointerState.tag, pointerState.sha);
					await assertTag(github, "cli-latest", pointerState.sha);
					await verifiedAssets(github, pointer, pointerState);
					return "complete";
				}
			}
		}
	}
	// Never repair the pointer here: dispatch through the CLI publisher's serial lock.
	// GITHUB_TOKEN-created refs do not trigger push workflows.
	await github.request("POST", "actions/workflows/release-cli.yml/dispatches", {
		ref: cliTag,
	});
	return "dispatched";
}

export async function updateCliLatest(
	github: GitHub,
	tag: string,
	sha: string,
): Promise<boolean> {
	const nextVersion = version(tag);
	await assertTag(github, tag, sha);
	const source = await releaseFor(github, tag);
	if (!source || source.draft || !source.prerelease)
		throw new Error(`CLI release is not published: ${tag}`);
	const sourceState = readState(source);
	assertSource(sourceState, tag, sha);
	if (sourceState.phase !== "complete")
		throw new Error(`CLI release is incomplete: ${tag}`);
	const sourceAssets = await verifiedAssets(github, source, sourceState);
	const manifest = new Blob([`${nextVersion}\n`]);
	const manifestAsset: LocalAsset = {
		name: "version.txt",
		size: manifest.size,
		digest: `sha256:${Bun.SHA256.hash(await manifest.arrayBuffer(), "hex")}`,
		open: () => manifest,
	};
	const state: ReleaseState = {
		...sourceState,
		phase: "pending",
		assets: [
			...sourceState.assets,
			{
				name: manifestAsset.name,
				size: manifestAsset.size,
				digest: manifestAsset.digest,
			},
		],
	};
	let pointer = await releaseFor(github, "cli-latest");
	let previousState: ReleaseState | undefined;
	if (pointer) {
		if (!pointer.prerelease)
			throw new Error("cli-latest must remain a prerelease");
		if ((pointer.body ?? "").includes("choros-release-state:")) {
			previousState = readState(pointer);
			const current = version(previousState.tag);
			if (Bun.semver.order(nextVersion, current) < 0) return false;
			if (current === nextVersion) assertSource(previousState, tag, sha);
			if (previousState.phase === "complete")
				await assertTag(github, "cli-latest", previousState.sha);
		} else {
			// Migrate a legacy pointer only when its manifest and immutable source prove ownership.
			const remote = await assetsFor(github, pointer);
			const currentManifest = remote.find(
				(asset) => asset.name === "version.txt",
			);
			if (
				!currentManifest ||
				currentManifest.state !== "uploaded" ||
				currentManifest.size > 100
			)
				throw new Error("Cannot verify legacy cli-latest version manifest");
			const current = (await github.text(currentManifest)).trim();
			version(`cli-v${current}`);
			if (Bun.semver.order(nextVersion, current) < 0) return false;
			const currentSha = await resolveTag(github, `cli-v${current}`);
			if (
				!currentSha ||
				(await resolveTag(github, "cli-latest")) !== currentSha
			)
				throw new Error("Legacy cli-latest SHA conflict");
			if (current === nextVersion && currentSha !== sha)
				throw new Error("cli-latest version has a different SHA");
		}
	}
	const notes =
		pointer?.body ??
		"Rolling pointer to the latest published CLI release; version.txt identifies its version.";
	// Persist the newer version BEFORE changing assets/ref. A failed update never loses the rollback floor.
	if (!pointer) {
		if (await resolveTag(github, "cli-latest"))
			throw new Error("Orphan cli-latest tag: inspect before recovery");
		pointer = await github.request<Release>("POST", "releases", {
			tag_name: "cli-latest",
			target_commitish: sha,
			name: "Latest Choros CLI",
			body: withState(notes, state),
			draft: true,
			prerelease: true,
			make_latest: "false",
		});
	} else if (previousState?.phase === "complete" && previousState.tag === tag) {
		await verifiedAssets(github, pointer, previousState);
		await assertTag(github, "cli-latest", sha);
		if (!pointer.draft) return true;
	} else {
		pointer = await github.request<Release>("PATCH", `releases/${pointer.id}`, {
			body: withState(notes, state),
		});
	}
	const remote = await assetsFor(github, pointer);
	for (const expected of state.assets) {
		const existing = remote.find((asset) => asset.name === expected.name);
		if (existing && (await matchesAsset(github, existing, expected))) continue;
		if (existing)
			await github.request("DELETE", `releases/assets/${existing.id}`);
		if (expected.name === "version.txt")
			await github.upload(pointer.id, manifestAsset);
		else {
			const asset = sourceAssets.find((entry) => entry.name === expected.name);
			if (!asset) throw new Error(`Missing source asset: ${expected.name}`);
			await github.copy(pointer.id, asset);
		}
	}
	for (const extra of remote.filter(
		(asset) => !state.assets.some((expected) => expected.name === asset.name),
	)) {
		await github.request("DELETE", `releases/assets/${extra.id}`);
	}
	await verifiedAssets(github, pointer, state);
	await assertTag(github, tag, sha);
	const pointerSha = await resolveTag(github, "cli-latest");
	if (!pointerSha)
		await github.request("POST", "git/refs", {
			ref: "refs/tags/cli-latest",
			sha,
		});
	else if (pointerSha !== sha)
		await github.request("PATCH", "git/refs/tags/cli-latest", {
			sha,
			force: true,
		});
	await github.request("PATCH", `releases/${pointer.id}`, {
		body: withState(notes, { ...state, phase: "complete" }),
		draft: false,
		prerelease: true,
		make_latest: "false",
	});
	return true;
}

export class GitHubClient implements GitHub {
	constructor(
		private readonly repository: string,
		private readonly token: string,
		private readonly fetcher: (
			url: string,
			init?: RequestInit,
		) => Promise<Response> = fetch,
	) {}

	async #response(
		method: string,
		url: string,
		body?: Bun.BodyInit,
		accept = "application/vnd.github+json",
		contentType = "application/json",
		size?: number,
	): Promise<Response> {
		const response = await this.fetcher(url, {
			method,
			headers: {
				Authorization: `Bearer ${this.token}`,
				Accept: accept,
				"Content-Type": contentType,
				"X-GitHub-Api-Version": "2022-11-28",
				...(size === undefined ? {} : { "Content-Length": String(size) }),
			},
			body,
		});
		if (!response.ok)
			throw new GitHubError(
				response.status,
				`GitHub ${method} ${url}: ${response.status} ${await response.text()}`,
			);
		return response;
	}

	async request<T>(method: string, path: string, body?: unknown): Promise<T> {
		const response = await this.#response(
			method,
			`https://api.github.com/repos/${this.repository}/${path}`,
			body === undefined ? undefined : JSON.stringify(body),
		);
		return (response.status === 204 ? undefined : await response.json()) as T;
	}

	#download(asset: RemoteAsset): Promise<Response> {
		return this.#response(
			"GET",
			`https://api.github.com/repos/${this.repository}/releases/assets/${asset.id}`,
			undefined,
			"application/octet-stream",
		);
	}

	async #uploadBody(
		releaseId: number,
		name: string,
		body: Bun.BodyInit,
		size: number,
	): Promise<RemoteAsset> {
		const response = await this.#response(
			"POST",
			`https://uploads.github.com/repos/${this.repository}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`,
			body,
			"application/vnd.github+json",
			"application/octet-stream",
			size,
		);
		return (await response.json()) as RemoteAsset;
	}

	upload(releaseId: number, asset: LocalAsset): Promise<RemoteAsset> {
		return this.#uploadBody(releaseId, asset.name, asset.open(), asset.size);
	}

	async copy(releaseId: number, asset: RemoteAsset): Promise<RemoteAsset> {
		const response = await this.#download(asset);
		if (!response.body) throw new Error(`Empty asset download: ${asset.name}`);
		return this.#uploadBody(releaseId, asset.name, response.body, asset.size);
	}

	async digest(asset: RemoteAsset): Promise<string> {
		if (asset.digest?.startsWith("sha256:")) return asset.digest;
		const response = await this.#download(asset);
		if (!response.body) throw new Error(`Empty asset download: ${asset.name}`);
		const hash = new Bun.CryptoHasher("sha256");
		for await (const chunk of response.body) hash.update(chunk);
		return `sha256:${hash.digest("hex")}`;
	}

	async text(asset: RemoteAsset): Promise<string> {
		return (await this.#download(asset)).text();
	}
}

async function localAssets(
	directory: string,
	stream: "cli" | "desktop",
): Promise<LocalAsset[]> {
	const assets: LocalAsset[] = [];
	for await (const name of new Bun.Glob(
		stream === "cli" ? "*.tar.gz" : "*",
	).scan({ cwd: directory, onlyFiles: true })) {
		const file = Bun.file(path.join(directory, name));
		const hash = new Bun.CryptoHasher("sha256");
		for await (const chunk of file.stream()) hash.update(chunk);
		assets.push({
			name: path.basename(name),
			size: file.size,
			digest: `sha256:${hash.digest("hex")}`,
			open: () => file,
		});
	}
	return assets.sort((left, right) => left.name.localeCompare(right.name));
}

if (import.meta.main) {
	const repository = process.env.GITHUB_REPOSITORY;
	const token = process.env.GH_TOKEN;
	const sha = process.env.GITHUB_SHA;
	const tag = process.env.RELEASE_TAG;
	if (!repository || !token || !sha || !tag)
		throw new Error(
			"GITHUB_REPOSITORY, GH_TOKEN, GITHUB_SHA and RELEASE_TAG are required",
		);
	const github = new GitHubClient(repository, token);
	const command = process.argv[2];
	if (command === "lockstep")
		console.log(await dispatchLockstep(github, tag, sha));
	else if (command === "cli" || command === "desktop") {
		await publishVersioned(github, {
			stream: command,
			tag,
			sha,
			assets: await localAssets("release-artifacts", command),
			notes:
				command === "desktop"
					? await Bun.file("release_notes.md").text()
					: undefined,
		});
	} else if (command === "cli-latest") {
		const newest = await updateCliLatest(github, tag, sha);
		if (process.env.GITHUB_OUTPUT)
			await fs.appendFile(process.env.GITHUB_OUTPUT, `is_newest=${newest}\n`);
		console.log(
			newest
				? `cli-latest serves ${tag}`
				: `Preserved newer cli-latest; skipped ${tag}`,
		);
	} else throw new Error(`Unknown release operation: ${command}`);
}
