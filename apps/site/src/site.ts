const SITE_NAME = "Choros";

const PAGE_PATHS = [
	"/",
	"/docs",
	"/docs/setup-teardown-scripts",
	"/docs/providers",
	"/docs/cli",
	"/docs/custom-themes",
	"/changelog",
	"/terms",
	"/privacy",
	"/status",
] as const;

export const PUBLIC_SITE_PATHS = new Set<string>(PAGE_PATHS);
export const PUBLIC_SITE_REDIRECTS = new Map<string, string>([
	["/app", "/"],
	["/marketplace/themes", "/docs/custom-themes"],
	["/docs/ports", "/docs/setup-teardown-scripts"],
]);
export const PUBLIC_SITE_ROUTE_PATHS = [
	...PAGE_PATHS,
	...PUBLIC_SITE_REDIRECTS.keys(),
] as const;

export function handlePublicSiteRequest(pathname: string): Response {
	const redirectTarget = PUBLIC_SITE_REDIRECTS.get(pathname);
	if (redirectTarget) return redirect(redirectTarget);

	const page = getPage(pathname);
	if (!page) {
		return html(
			pageShell(
				"Page not found",
				`<main class="narrow"><p class="eyebrow">404</p><h1>This path has no page.</h1><p class="lede">Use the documentation index to find the maintained Choros pages.</p><p><a class="button" href="/docs">Open documentation</a></p></main>`,
			),
			404,
		);
	}

	return html(pageShell(page.title, page.body));
}

type SitePage = { title: string; body: string };

function getPage(pathname: string): SitePage | null {
	switch (pathname) {
		case "/":
			return {
				title: "Agent work, under command",
				body: `<main>
<section class="hero">
<div><p class="eyebrow">Desktop command center for coding agents</p><h1>Keep parallel work<br><em>legible.</em></h1><p class="lede">Choros gives every agent an isolated workspace, a real terminal, and a place in the same operating picture.</p><div class="actions"><a class="button" href="/docs">Read the docs</a><a class="text-link" href="/changelog">What changed <span aria-hidden="true">→</span></a></div></div>
<aside class="terminal" aria-label="Example Choros command"><div class="terminal-bar"><span></span><span></span><span></span><b>choros</b></div><pre><code><i>$</i> choros ws create \\
  --branch fix-auth \\
  --agent claude \\
  --prompt "repair sign-in"

<span>workspace ready</span>
agent running</code></pre></aside>
</section>
<section class="grid" aria-label="Product principles">
<article><b>01</b><h2>Isolation by default</h2><p>Each workspace gets its own branch, files, terminal, and agent context.</p></article>
<article><b>02</b><h2>One control surface</h2><p>Read progress, send follow-ups, and move between active work without losing the thread.</p></article>
<article><b>03</b><h2>Your machine, your tools</h2><p>Projects continue to use their existing package managers, credentials, and development commands.</p></article>
</section>
</main>`,
			};
		case "/docs":
			return {
				title: "Documentation",
				body: `<main><p class="eyebrow">Documentation</p><h1>Run the work.<br><em>Keep the context.</em></h1><p class="lede">Start with the workflow you are setting up.</p><section class="link-list">
<a href="/docs/setup-teardown-scripts"><span>Workspace lifecycle scripts</span><small>Install dependencies, copy local configuration, run, and clean up.</small><b>01</b></a>
<a href="/docs/providers"><span>Model providers</span><small>Connect the coding agents you already use.</small><b>02</b></a>
<a href="/docs/cli"><span>Command-line interface</span><small>Create and inspect workspaces without leaving the terminal.</small><b>03</b></a>
<a href="/docs/custom-themes"><span>Custom themes</span><small>Shape the desktop interface around your working environment.</small><b>04</b></a>
</section></main>`,
			};
		case "/docs/setup-teardown-scripts":
			return {
				title: "Workspace lifecycle scripts",
				body: docPage(
					"Workspace lifecycle scripts",
					"Make every new workspace ready to run without repeating machine setup by hand.",
					`<h2>Configuration</h2><p>Commit <code>.choros/config.json</code> in the repository root. Commands run sequentially inside the workspace.</p><pre><code>{
  "setup": ["bun install", "cp \\&quot;$CHOROS_ROOT_PATH/.env\\&quot; .env"],
  "teardown": ["docker compose down"],
  "run": ["bun run dev"]
}</code></pre><h2>Command roles</h2><dl><dt><code>setup</code></dt><dd>Install dependencies and prepare local configuration when a workspace is created.</dd><dt><code>teardown</code></dt><dd>Stop or remove resources started for that workspace before deletion.</dd><dt><code>run</code></dt><dd>Start the project from the Run button in a restartable pane.</dd></dl><h2>Available paths</h2><p><code>CHOROS_ROOT_PATH</code> points to the main checkout. <code>CHOROS_WORKSPACE_PATH</code> and <code>CHOROS_WORKSPACE_NAME</code> identify the isolated workspace.</p><p>Keep setup short. Put multi-step logic in a committed script and call that script from the configuration.</p>`,
				),
			};
		case "/docs/providers":
			return {
				title: "Model providers",
				body: docPage(
					"Model providers",
					"Choros coordinates coding agents; each provider still owns its model access and credentials.",
					`<h2>Connect a provider</h2><ol><li>Open Choros and complete sign-in.</li><li>Use onboarding or Settings to select a supported coding agent.</li><li>Complete that provider's own authentication flow.</li><li>Create a workspace and start the agent with a concrete task.</li></ol><p>Credentials stay in the provider's normal local configuration. Do not paste API keys into workspace prompts or committed project files.</p>`,
				),
			};
		case "/docs/cli":
			return {
				title: "Command-line interface",
				body: docPage(
					"Command-line interface",
					"Use the same Choros workspaces and agents from a shell.",
					`<h2>Core commands</h2><pre><code>choros ws list
choros ws create --project PROJECT_ID --branch BRANCH \\
  --agent claude --prompt "TASK"
choros agents create --workspace WORKSPACE_ID \\
  --agent claude --prompt "FOLLOW-UP"
choros terminals read --workspace WORKSPACE_ID \\
  --terminal TERMINAL_ID</code></pre><p>Commands return JSON automatically in agent and CI environments. Pass <code>--json</code> when a script needs a stable machine-readable response.</p><p>Run <code>choros --help</code> or <code>choros &lt;command&gt; --help</code> for the exact options installed with your desktop version.</p>`,
				),
			};
		case "/docs/custom-themes":
			return {
				title: "Custom themes",
				body: docPage(
					"Custom themes",
					"Tune Choros for the room, display, and hours in which you work.",
					`<h2>Choose or edit a theme</h2><p>Open <strong>Settings → Appearance</strong>. Select a built-in theme or use the custom theme controls exposed there.</p><p>Check text, muted text, borders, selections, terminal output, and focus states together. A theme is usable only when those states remain distinct in both active and inactive panes.</p>`,
				),
			};
		case "/changelog":
			return {
				title: "Changelog",
				body: docPage(
					"Changelog",
					"Public product and infrastructure changes, newest first.",
					`<h2>September 4, 2026</h2><ul><li>Moved public pages into a standalone static site build under <code>apps/site</code>.</li><li>Prepared documentation, changelog, terms, privacy, and status for GitHub Pages under one project path.</li><li>Kept authentication and usage events on the existing Worker origin.</li></ul>`,
				),
			};
		case "/terms":
			return {
				title: "Terms",
				body: docPage(
					"Terms of use",
					"Effective September 4, 2026.",
					`<p>Use Choros only with systems, repositories, accounts, and data you are authorized to access. You are responsible for reviewing agent output before applying or shipping it.</p><p>Third-party model providers, source hosts, and other connected services remain subject to their own terms. Choros may change during its preview period, including supported integrations and availability.</p><p>Do not use the service to violate law, bypass access controls, distribute malware, or interfere with other users or systems.</p>`,
				),
			};
		case "/privacy":
			return {
				title: "Privacy",
				body: docPage(
					"Privacy notice",
					"Effective September 4, 2026.",
					`<p>Choros processes account identity and session data needed for sign-in. The desktop may send a minimal authenticated application-open event containing its version, platform, event time, and a random event identifier.</p><p>Projects and workspace files are managed on the machine running Choros. Content sent to a coding-agent provider is handled under that provider's account and policies.</p><p>Do not place secrets in prompts, logs, or repository files. Revoke provider access through that provider and sign out of Choros when a device is no longer trusted.</p>`,
				),
			};
		case "/status":
			return {
				title: "Status",
				body: docPage(
					"Service status",
					"The public Choros site is reachable.",
					`<div class="status"><span></span><strong>Public site operational</strong></div><p>This check covers the page currently serving you. Provider availability and local desktop services are independent.</p>`,
				),
			};
		default:
			return null;
	}
}

function docPage(title: string, intro: string, content: string): string {
	return `<main class="docs"><p class="eyebrow"><a href="/docs">Documentation</a></p><h1>${title}</h1><p class="lede">${intro}</p><article>${content}</article></main>`;
}

function redirect(pathname: string): Response {
	return new Response(null, {
		status: 308,
		headers: { Location: pathname },
	});
}

function html(body: string, status = 200): Response {
	return new Response(body, {
		status,
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			"Content-Security-Policy":
				"default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
			"Referrer-Policy": "no-referrer",
			"X-Content-Type-Options": "nosniff",
		},
	});
}

function pageShell(title: string, body: string): string {
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#191816"><title>${title} · ${SITE_NAME}</title><style>${styles}</style></head>
<body><header><a class="brand" href="/" aria-label="Choros home"><span>C</span>CHOROS</a><nav><a href="/docs">Docs</a><a href="/changelog">Changelog</a><a href="/status">Status</a></nav></header>${body}<footer><span>CHOROS / TEKTON AI</span><nav><a href="/terms">Terms</a><a href="/privacy">Privacy</a></nav></footer></body></html>`;
}

const styles = `
:root{color-scheme:dark;--ink:#f0ece2;--muted:#aaa59b;--line:#3a3833;--paper:#191816;--panel:#22211e;--acid:#d8ff3e;--serif:Georgia,"Times New Roman",serif;--mono:"SFMono-Regular",Consolas,"Liberation Mono",monospace}*{box-sizing:border-box}html{background:var(--paper);color:var(--ink);font-family:var(--mono);scroll-behavior:smooth}body{margin:0;min-height:100vh;background:radial-gradient(circle at 84% 12%,#2d3020 0,transparent 28rem),linear-gradient(#ffffff05 1px,transparent 1px);background-size:auto,100% 5rem}a{color:inherit}header,footer{width:min(1180px,calc(100% - 40px));margin:auto;display:flex;align-items:center;justify-content:space-between}header{height:88px;border-bottom:1px solid var(--line)}header nav,footer nav{display:flex;gap:28px}header nav a,footer a{color:var(--muted);font-size:12px;text-decoration:none;text-transform:uppercase;letter-spacing:.1em}.brand{display:flex;gap:11px;align-items:center;text-decoration:none;font-size:13px;letter-spacing:.18em}.brand span{display:grid;place-items:center;width:29px;height:29px;border:1px solid var(--acid);color:var(--acid);font-family:var(--serif);font-size:18px}main{width:min(1180px,calc(100% - 40px));margin:0 auto}.hero{min-height:610px;display:grid;grid-template-columns:1.2fr .8fr;gap:7vw;align-items:center;padding:70px 0}.eyebrow{color:var(--acid);font-size:11px;letter-spacing:.15em;text-transform:uppercase}.eyebrow a{text-decoration:none}h1{font:normal clamp(54px,8vw,112px)/.88 var(--serif);letter-spacing:-.055em;margin:25px 0 30px;max-width:900px}h1 em{color:var(--acid);font-weight:normal}.lede{max-width:690px;color:var(--muted);font:normal clamp(17px,2vw,22px)/1.55 var(--serif)}.actions{display:flex;align-items:center;gap:30px;margin-top:40px}.button{display:inline-block;background:var(--acid);color:#151510;padding:14px 20px;text-decoration:none;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.08em}.text-link{font-size:12px;text-decoration:none}.terminal{border:1px solid #4c4a43;background:#11110f;box-shadow:22px 22px 0 #0e0e0d;transform:rotate(1.3deg)}.terminal-bar{height:40px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:7px;padding:0 13px}.terminal-bar span{width:7px;height:7px;border-radius:50%;background:#57544d}.terminal-bar b{margin-left:auto;color:#77736b;font-size:9px;letter-spacing:.15em}.terminal pre{margin:0;padding:30px;min-height:260px;white-space:pre-wrap;line-height:1.8;color:#d5d0c5}.terminal i,.terminal span{color:var(--acid);font-style:normal}.grid{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--line);border-left:1px solid var(--line);margin-bottom:100px}.grid article{min-height:240px;padding:28px;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}.grid b,.link-list b{color:var(--acid);font-size:11px}.grid h2{font:normal 28px/1.1 var(--serif);margin:55px 0 15px}.grid p,.docs article p,.docs li,.docs dd{color:var(--muted);font-size:14px;line-height:1.7}.link-list{margin:70px 0 110px;border-top:1px solid var(--line)}.link-list a{position:relative;display:grid;grid-template-columns:1fr 1fr auto;gap:30px;align-items:center;padding:30px 5px;border-bottom:1px solid var(--line);text-decoration:none;transition:padding .2s,background .2s}.link-list a:hover{padding-left:20px;background:#ffffff05}.link-list span{font:normal 25px var(--serif)}.link-list small{color:var(--muted);line-height:1.5}.docs{max-width:900px;padding:90px 0 120px}.docs h1,.narrow h1{font-size:clamp(48px,7vw,80px)}.docs article{border-top:1px solid var(--line);margin-top:60px;padding-top:25px;max-width:760px}.docs h2{font:normal 30px var(--serif);margin:45px 0 12px}.docs pre{padding:22px;overflow:auto;border:1px solid var(--line);background:#10100f;color:#d7d2c8;line-height:1.6}.docs code{font-family:var(--mono);color:#e5ffa0}.docs dt{margin-top:22px}.docs dd{margin:7px 0 0}.status{display:flex;align-items:center;gap:13px;padding:22px;border:1px solid var(--line);background:var(--panel)}.status span{width:10px;height:10px;border-radius:50%;background:var(--acid);box-shadow:0 0 18px var(--acid)}.narrow{padding:110px 0;min-height:650px}footer{min-height:120px;border-top:1px solid var(--line);color:var(--muted);font-size:10px;letter-spacing:.13em}@media(max-width:760px){header nav{gap:13px}.hero{grid-template-columns:1fr;padding:70px 0 100px}.terminal{transform:none;box-shadow:12px 12px 0 #0e0e0d}.grid{grid-template-columns:1fr}.link-list a{grid-template-columns:1fr auto}.link-list small{grid-column:1/3;grid-row:2}h1{font-size:58px}footer{align-items:flex-start;padding-top:30px}footer nav{gap:14px}}
`;
