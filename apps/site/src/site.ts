import { DEFAULT_LOCALE, i18n, initI18n } from "@choros/i18n";

initI18n(DEFAULT_LOCALE);

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

export const PUBLIC_SITE_ASSETS: ReadonlyMap<string, URL> = new Map([
	[
		"/assets/choros-logo-light.svg",
		new URL("../public/assets/choros-logo-light.svg", import.meta.url),
	],
	[
		"/assets/workspace-overview.svg",
		new URL("../public/assets/workspace-overview.svg", import.meta.url),
	],
	[
		"/assets/workspace-overview-mobile.svg",
		new URL("../public/assets/workspace-overview-mobile.svg", import.meta.url),
	],
	[
		"/assets/workspace-agents.svg",
		new URL("../public/assets/workspace-agents.svg", import.meta.url),
	],
	[
		"/assets/workspace-changes.svg",
		new URL("../public/assets/workspace-changes.svg", import.meta.url),
	],
]);

export function handlePublicSiteRequest(pathname: string): Response {
	const asset = PUBLIC_SITE_ASSETS.get(pathname);
	if (asset) {
		return new Response(Bun.file(asset), {
			headers: {
				"Content-Type": "image/svg+xml",
				"X-Content-Type-Options": "nosniff",
				"Referrer-Policy": "no-referrer",
			},
		});
	}

	const redirectTarget = PUBLIC_SITE_REDIRECTS.get(pathname);
	if (redirectTarget) return redirect(redirectTarget);

	const page = getPage(pathname);
	if (!page) {
		return html(
			pageShell(
				"Page not found",
				`<main id="main-content" class="narrow" tabindex="-1"><p class="eyebrow">404</p><h1>This path has no page.</h1><p class="lede">Use the documentation index to find the maintained Choros pages.</p><p><a class="button" href="/docs">Open documentation</a></p></main>`,
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
				title: i18n._({
					id: "site.home.title",
					message: "One clear workspace for your coding agents",
				}),
				body: `<main id="main-content" class="home" tabindex="-1">
<section class="hero" aria-labelledby="hero-title">
	<svg class="hero-mark" viewBox="0 0 256 256" fill="none" aria-hidden="true" focusable="false"><g stroke="currentColor" stroke-width="20" stroke-linecap="round"><path d="M202.71 57.29 A100 100 0 1 0 202.71 198.71"/><path d="M177.23 78.77 A66 66 0 1 0 177.23 177.23"/><path d="M151.69 102.78 A32 32 0 1 0 151.69 153.22"/></g></svg>
	<p class="eyebrow">${Bun.escapeHTML(i18n._({ id: "site.hero.eyebrow", message: "The workspace for coding agents" }))}</p>
	<h1 id="hero-title">${Bun.escapeHTML(i18n._({ id: "site.hero.title", message: "Your agents. One clear workspace." }))}</h1>
	<p class="lede">${Bun.escapeHTML(i18n._({ id: "site.hero.description", message: "Run coding agents in parallel, give each task its own Git worktree, and review the changes. All in one desktop workspace." }))}</p>
	<div class="actions">
		<a class="button" href="/#download">${Bun.escapeHTML(i18n._({ id: "site.action.downloadChoros", message: "Download Choros" }))}<span aria-hidden="true">↓</span></a>
		<a class="text-link" href="/#product">${Bun.escapeHTML(i18n._({ id: "site.action.exploreWorkflow", message: "Explore the workflow" }))}<span aria-hidden="true">↘</span></a>
	</div>
</section>
<figure class="product-overview">
	<div class="product-image">
		<picture>
			<source media="(max-width: 640px)" srcset="/assets/workspace-overview-mobile.svg 840w" width="840" height="960">
			<img src="/assets/workspace-overview.svg" srcset="/assets/workspace-overview.svg 1920w" sizes="(max-width: 767px) calc(100vw - 40px), (max-width: 1244px) calc(100vw - 64px), 1180px" width="1920" height="1200" fetchpriority="high" alt="${Bun.escapeHTML(i18n._({ id: "site.image.overview", message: "Workflow illustration: one project branches into independent agent workspaces, then brings their changes together for review." }))}">
		</picture>
	</div>
	<figcaption>
		<span>${Bun.escapeHTML(i18n._({ id: "site.image.overviewCaption", message: "One project. Independent workspaces. A shared view. Workflow illustrated." }))}</span>
		<a class="text-link" href="/assets/workspace-overview.svg">${Bun.escapeHTML(i18n._({ id: "site.action.viewFullWorkspace", message: "View full illustration" }))}<span aria-hidden="true">↗</span></a>
	</figcaption>
</figure>
<section id="product" class="workflow section" aria-labelledby="workflow-title">
	<div class="section-heading">
		<p class="eyebrow">${Bun.escapeHTML(i18n._({ id: "site.workflow.eyebrow", message: "A clearer way to work" }))}</p>
		<h2 id="workflow-title">${Bun.escapeHTML(i18n._({ id: "site.workflow.title", message: "From first prompt to final diff." }))}</h2>
	</div>
	<article class="workflow-step">
		<div class="workflow-copy">
			<span class="step-number" aria-hidden="true">01</span>
			<h3>${Bun.escapeHTML(i18n._({ id: "site.workflow.parallelTitle", message: "Run work in parallel." }))}</h3>
			<p>${Bun.escapeHTML(i18n._({ id: "site.workflow.parallelDescription", message: "Start agents on separate tasks without turning your desktop into a wall of terminals. Check progress, send a follow-up, and pick up the next thread." }))}</p>
			<a class="text-link" href="/docs/providers">${Bun.escapeHTML(i18n._({ id: "site.action.connectAgents", message: "Connect your agents" }))}<span aria-hidden="true">↗</span></a>
		</div>
		<figure class="workflow-image">
			<img src="/assets/workspace-agents.svg" width="1200" height="750" loading="lazy" decoding="async" alt="${Bun.escapeHTML(i18n._({ id: "site.image.agents", message: "Illustration of three independent agent tasks progressing in parallel." }))}">
		</figure>
	</article>
	<article class="workflow-step">
		<div class="workflow-copy">
			<span class="step-number" aria-hidden="true">02</span>
			<h3>${Bun.escapeHTML(i18n._({ id: "site.workflow.isolationTitle", message: "Give each task its own space." }))}</h3>
			<p>${Bun.escapeHTML(i18n._({ id: "site.workflow.isolationDescription", message: "Each workspace has its own Git worktree, branch, and file context. Keep parallel changes separate while using your repository's existing tools and setup commands." }))}</p>
			<a class="text-link" href="/docs/setup-teardown-scripts">${Bun.escapeHTML(i18n._({ id: "site.action.prepareWorkspace", message: "Prepare your workspace" }))}<span aria-hidden="true">↗</span></a>
		</div>
		<figure class="workflow-image workspace-detail">
			<img src="/assets/workspace-overview-mobile.svg" width="840" height="960" loading="lazy" decoding="async" alt="${Bun.escapeHTML(i18n._({ id: "site.image.workspaces", message: "Illustration of separate workspaces branching from one project." }))}">
		</figure>
	</article>
	<article class="workflow-step">
		<div class="workflow-copy">
			<span class="step-number" aria-hidden="true">03</span>
			<h3>${Bun.escapeHTML(i18n._({ id: "site.workflow.reviewTitle", message: "Review before you merge." }))}</h3>
			<p>${Bun.escapeHTML(i18n._({ id: "site.workflow.reviewDescription", message: "Move from the agent's work to the actual changes. Read the diff alongside your workspace, check the details, and decide what is ready to merge." }))}</p>
			<a class="text-link" href="/docs">${Bun.escapeHTML(i18n._({ id: "site.action.readDocs", message: "Read the docs" }))}<span aria-hidden="true">↗</span></a>
		</div>
		<figure class="workflow-image">
			<img src="/assets/workspace-changes.svg" width="1200" height="750" loading="lazy" decoding="async" alt="${Bun.escapeHTML(i18n._({ id: "site.image.changes", message: "Illustration of additions and removals flowing into a code review." }))}">
		</figure>
	</article>
</section>
<section id="download" class="download section" aria-labelledby="download-title">
	<div class="section-heading">
		<p class="eyebrow">${Bun.escapeHTML(i18n._({ id: "site.download.eyebrow", message: "Make room for your next idea" }))}</p>
		<h2 id="download-title">${Bun.escapeHTML(i18n._({ id: "site.action.downloadChoros", message: "Download Choros" }))}</h2>
		<p>${Bun.escapeHTML(i18n._({ id: "site.download.description", message: "A desktop app for your development workflow. Choose the build for your machine." }))}</p>
	</div>
	<div class="platform-downloads">
		<a class="platform-download" href="https://github.com/tekton-ai/choros/releases/latest/download/Choros-arm64.dmg">
			<span><strong>${Bun.escapeHTML(i18n._({ id: "site.download.appleSilicon", message: "macOS · Apple Silicon" }))}</strong><small>${Bun.escapeHTML(i18n._({ id: "site.download.appleSiliconDetail", message: "For Macs with an Apple chip" }))}</small></span><span class="download-arrow" aria-hidden="true">↓</span>
		</a>
		<a class="platform-download" href="https://github.com/tekton-ai/choros/releases/latest/download/Choros-x64.dmg">
			<span><strong>${Bun.escapeHTML(i18n._({ id: "site.download.intel", message: "macOS · Intel" }))}</strong><small>${Bun.escapeHTML(i18n._({ id: "site.download.intelDetail", message: "For Macs with an Intel processor" }))}</small></span><span class="download-arrow" aria-hidden="true">↓</span>
		</a>
		<a class="platform-download" href="https://github.com/tekton-ai/choros/releases/latest/download/Choros-x86_64.AppImage">
			<span><strong>${Bun.escapeHTML(i18n._({ id: "site.download.linux", message: "Linux · x86_64" }))}</strong><small>${Bun.escapeHTML(i18n._({ id: "site.download.linuxDetail", message: "AppImage for x86_64 desktops" }))}</small></span><span class="download-arrow" aria-hidden="true">↓</span>
		</a>
	</div>
	<div class="download-help">
		<a class="text-link" href="/docs">${Bun.escapeHTML(i18n._({ id: "site.action.getStarted", message: "Installation and first steps" }))}<span aria-hidden="true">→</span></a>
		<a class="text-link" href="https://github.com/tekton-ai/choros/releases/latest">${Bun.escapeHTML(i18n._({ id: "site.action.allReleases", message: "All releases" }))}<span aria-hidden="true">↗</span></a>
	</div>
</section>
<section class="faq section" aria-labelledby="faq-title">
	<div class="section-heading">
		<p class="eyebrow">${Bun.escapeHTML(i18n._({ id: "site.faq.eyebrow", message: "Before you begin" }))}</p>
		<h2 id="faq-title">${Bun.escapeHTML(i18n._({ id: "site.faq.title", message: "A few things worth knowing." }))}</h2>
	</div>
	<div class="faq-list">
		<details>
			<summary>${Bun.escapeHTML(i18n._({ id: "site.faq.agentsQuestion", message: "Which coding agents can I use?" }))}<span aria-hidden="true">+</span></summary>
			<div class="faq-answer"><p>${Bun.escapeHTML(i18n._({ id: "site.faq.agentsAnswer", message: "Choose from the coding agents available in Choros settings. Each agent uses its own provider account and credentials; Choros brings their work into the same workspace." }))}</p><a class="text-link" href="/docs/providers">${Bun.escapeHTML(i18n._({ id: "site.action.providerGuide", message: "Read the provider guide" }))}<span aria-hidden="true">→</span></a></div>
		</details>
		<details>
			<summary>${Bun.escapeHTML(i18n._({ id: "site.faq.repositoriesQuestion", message: "Can I use an existing repository?" }))}<span aria-hidden="true">+</span></summary>
			<div class="faq-answer"><p>${Bun.escapeHTML(i18n._({ id: "site.faq.repositoriesAnswer", message: "Yes. Work with your existing Git repository and development tools. Workspace setup scripts can install dependencies and prepare local configuration for each new worktree." }))}</p><a class="text-link" href="/docs/setup-teardown-scripts">${Bun.escapeHTML(i18n._({ id: "site.action.workspaceGuide", message: "Read the workspace guide" }))}<span aria-hidden="true">→</span></a></div>
		</details>
		<details>
			<summary>${Bun.escapeHTML(i18n._({ id: "site.faq.dataQuestion", message: "Where does my code go?" }))}<span aria-hidden="true">+</span></summary>
			<div class="faq-answer"><p>${Bun.escapeHTML(i18n._({ id: "site.faq.dataAnswer", message: "Projects and workspace files are managed on the machine running Choros. Content sent to a coding-agent provider is handled under that provider's account and policies. Review your provider settings before sharing sensitive code." }))}</p><a class="text-link" href="/privacy">${Bun.escapeHTML(i18n._({ id: "site.action.privacyNotice", message: "Read the privacy notice" }))}<span aria-hidden="true">→</span></a></div>
		</details>
		<details>
			<summary>${Bun.escapeHTML(i18n._({ id: "site.faq.platformsQuestion", message: "Which platforms can I download?" }))}<span aria-hidden="true">+</span></summary>
			<div class="faq-answer"><p>${Bun.escapeHTML(i18n._({ id: "site.faq.platformsAnswer", message: "Current desktop downloads are available for macOS on Apple Silicon or Intel, and Linux x86_64. On a phone, you can browse the docs and choose a download for your desktop computer." }))}</p><a class="text-link" href="/#download">${Bun.escapeHTML(i18n._({ id: "site.action.chooseDownload", message: "Choose your download" }))}<span aria-hidden="true">→</span></a></div>
		</details>
	</div>
</section>
</main>`,
			};
		case "/docs":
			return {
				title: "Documentation",
				body: `<main id="main-content" tabindex="-1"><p class="eyebrow">Documentation</p><h1>Run the work.<br><em>Keep the context.</em></h1><p class="lede">Start with the workflow you are setting up.</p><section class="link-list">
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
	return `<main id="main-content" class="docs" tabindex="-1"><p class="eyebrow"><a href="/docs">Documentation</a></p><h1>${title}</h1><p class="lede">${intro}</p><article>${content}</article></main>`;
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
	const description = i18n._({
		id: "site.meta.description",
		message:
			"Choros is a desktop workspace for coding agents. Run tasks in parallel in isolated Git worktrees, follow progress, and review code changes in one place.",
	});
	const homeLabel = Bun.escapeHTML(
		i18n._({ id: "site.nav.home", message: "Choros home" }),
	);
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<meta name="theme-color" content="#111113">
	<meta name="color-scheme" content="dark">
	<meta name="description" content="${Bun.escapeHTML(description)}">
	<meta property="og:type" content="website">
	<meta property="og:site_name" content="${SITE_NAME}">
	<meta property="og:title" content="${Bun.escapeHTML(title)} · ${SITE_NAME}">
	<meta property="og:description" content="${Bun.escapeHTML(description)}">
	<title>${Bun.escapeHTML(title)} · ${SITE_NAME}</title>
	<style>${styles}</style>
</head>
<body>
<a class="skip-link" href="#main-content">${Bun.escapeHTML(i18n._({ id: "site.action.skipToContent", message: "Skip to content" }))}</a>
<header class="site-header">
	<div class="header-inner">
		<a class="brand" href="/" aria-label="${homeLabel}"><img src="/assets/choros-logo-light.svg" width="470" height="128" alt=""></a>
		<nav class="primary-nav" aria-label="${Bun.escapeHTML(i18n._({ id: "site.nav.primary", message: "Main navigation" }))}">
			<a href="/#product">${Bun.escapeHTML(i18n._({ id: "site.nav.product", message: "Product" }))}</a>
			<a href="/docs">${Bun.escapeHTML(i18n._({ id: "site.nav.docs", message: "Docs" }))}</a>
			<a href="/changelog">${Bun.escapeHTML(i18n._({ id: "site.nav.changelog", message: "Changelog" }))}</a>
		</nav>
		<a class="button header-download" href="/#download">${Bun.escapeHTML(i18n._({ id: "site.nav.download", message: "Download" }))}<span aria-hidden="true">↓</span></a>
	</div>
</header>
${body}
<footer class="site-footer">
	<div class="footer-top">
		<div class="footer-identity">
			<a class="brand" href="/" aria-label="${homeLabel}"><img src="/assets/choros-logo-light.svg" width="470" height="128" alt=""></a>
			<p>${Bun.escapeHTML(i18n._({ id: "site.footer.description", message: "A clear space for the work ahead." }))}</p>
		</div>
		<nav class="footer-nav" aria-label="${Bun.escapeHTML(i18n._({ id: "site.nav.footer", message: "Footer navigation" }))}">
			<a href="https://github.com/tekton-ai/choros">${Bun.escapeHTML(i18n._({ id: "site.nav.github", message: "GitHub" }))}<span aria-hidden="true">↗</span></a>
			<a href="/docs">${Bun.escapeHTML(i18n._({ id: "site.nav.docs", message: "Docs" }))}</a>
			<a href="/changelog">${Bun.escapeHTML(i18n._({ id: "site.nav.changelog", message: "Changelog" }))}</a>
			<a href="/status">${Bun.escapeHTML(i18n._({ id: "site.nav.status", message: "Status" }))}</a>
		</nav>
	</div>
	<div class="footer-bottom">
		<span>${Bun.escapeHTML(i18n._({ id: "site.footer.credit", message: "Choros / Tekton AI" }))}</span>
		<nav aria-label="${Bun.escapeHTML(i18n._({ id: "site.nav.legal", message: "Legal" }))}">
			<a href="/terms">${Bun.escapeHTML(i18n._({ id: "site.nav.terms", message: "Terms" }))}</a>
			<a href="/privacy">${Bun.escapeHTML(i18n._({ id: "site.nav.privacy", message: "Privacy" }))}</a>
		</nav>
	</div>
</footer>
</body>
</html>`;
}

const styles = `
:root{color-scheme:dark;--ink:#f5f5f6;--muted:#a5a5ad;--line:#ffffff1a;--paper:#111113;--panel:#19191d;--acid:#d8ff3e;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;--mono:"SFMono-Regular",Consolas,"Liberation Mono",monospace}
*{box-sizing:border-box}
html{background:var(--paper);color:var(--ink);font-family:var(--sans);scroll-behavior:smooth;scroll-padding-top:112px;-webkit-text-size-adjust:100%}
body{margin:0;min-width:280px;min-height:100vh;-webkit-font-smoothing:antialiased}
a{color:inherit;text-underline-offset:4px}
a,summary{touch-action:manipulation}
a:focus-visible,summary:focus-visible,main:focus-visible{outline:2px solid var(--acid);outline-offset:5px}
img{display:block;max-width:100%;height:auto}
figure{margin:0}
p{line-height:1.65}
h1,h2,h3,p{overflow-wrap:break-word}
h1,h2,h3{font-weight:550}
h1{font-size:clamp(42px,6.5vw,80px);line-height:1.08;letter-spacing:-.055em;margin:24px 0;max-width:900px;text-wrap:balance}
h1 em{font-style:normal;color:var(--ink)}
h2{font-size:clamp(32px,4vw,48px);line-height:1.15;letter-spacing:-.04em;margin:18px 0 0;text-wrap:balance}
h3{font-size:clamp(26px,2.7vw,34px);line-height:1.2;letter-spacing:-.035em;margin:24px 0 16px;text-wrap:balance}
main,.header-inner,.site-footer{width:min(1180px,calc(100% - 64px));margin-inline:auto}
main:not(.home){padding-top:88px}
.skip-link{position:fixed;top:12px;left:20px;z-index:10;background:var(--ink);color:var(--paper);padding:14px 20px;border-radius:5px;font-weight:600;transform:translateY(-180%)}
.skip-link:focus{transform:translateY(0)}
.site-header{position:sticky;top:0;z-index:5;border-bottom:1px solid var(--line);background:#111113f5}
.header-inner{min-height:84px;display:flex;align-items:center;gap:36px}
.brand{display:inline-flex;align-items:center;min-height:44px;flex-shrink:0;text-decoration:none}
.brand img{width:132px;height:auto}
.primary-nav{display:flex;align-items:center;gap:30px;margin-left:auto}
.primary-nav a,.footer-nav a,.footer-bottom a{display:inline-flex;align-items:center;gap:8px;min-width:44px;min-height:44px;color:var(--muted);font-size:14px;text-decoration:none;transition:color .16s}
.primary-nav a:hover,.footer-nav a:hover,.footer-bottom a:hover{color:var(--ink)}
.button{display:inline-flex;align-items:center;justify-content:center;gap:18px;min-height:50px;padding:13px 21px;border:1px solid var(--ink);border-radius:6px;background:var(--ink);color:var(--paper);font-size:15px;font-weight:600;text-decoration:none;line-height:1.4;transition:background .16s,border-color .16s,transform .16s}
.button:hover{background:#dddde0;border-color:#dddde0;transform:translateY(-1px)}
.header-download{min-height:44px;padding:10px 17px;font-size:14px;gap:16px}
.hero{position:relative;isolation:isolate;padding:96px 0 60px}
.hero-mark{position:absolute;width:360px;height:360px;right:0;top:76px;z-index:-1;color:var(--ink);opacity:.035;pointer-events:none}
.eyebrow{font-family:var(--mono);color:var(--muted);font-size:11px;line-height:1.6;font-weight:500;letter-spacing:.14em;text-transform:uppercase;margin:0}
.eyebrow a{text-decoration:none}
.hero .eyebrow{display:flex;align-items:center;gap:12px}
.hero .eyebrow::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--acid);flex:none}
.hero h1{max-width:850px;margin-top:26px;margin-bottom:26px}
.lede{max-width:620px;color:var(--muted);font-size:clamp(17px,1.7vw,20px);line-height:1.65;margin:0}
.actions{display:flex;align-items:center;flex-wrap:wrap;gap:18px 30px;margin-top:32px}
.text-link{display:inline-flex;align-items:center;justify-content:flex-start;gap:10px;min-height:44px;font-size:14px;font-weight:500;text-decoration:none;line-height:1.5;transition:color .16s}
.text-link:hover{color:var(--acid)}
.text-link span{flex-shrink:0}
.product-image,.workflow-image{overflow:hidden;border:1px solid var(--line);border-radius:10px;background:var(--panel)}
.product-image img{width:100%;aspect-ratio:8/5;object-fit:cover}
.product-overview figcaption{display:flex;align-items:center;justify-content:space-between;gap:8px 24px;padding-top:16px;color:var(--muted);font-size:13px;line-height:1.6}
.product-overview figcaption .text-link{font-size:13px;flex-shrink:0}
.section{padding-block:100px}
.section-heading>p:not(.eyebrow){max-width:520px;font-size:17px;color:var(--muted);margin:22px 0 0}
.workflow{padding-bottom:48px}
.workflow .section-heading{padding-bottom:44px}
.workflow-step{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.45fr);align-items:center;gap:64px;border-top:1px solid var(--line);padding-block:56px}
.step-number{font:12px var(--mono);color:var(--acid)}
.workflow-copy p{margin:0;color:var(--muted);font-size:16px;line-height:1.75;max-width:360px}
.workflow-copy .text-link{margin-top:16px}
.workflow-image img{width:100%;aspect-ratio:8/5;object-fit:cover;object-position:left center}
.workspace-detail img{object-fit:contain;object-position:center}
.download{border-top:1px solid var(--line)}
.download .section-heading{max-width:700px}
.platform-downloads{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-block:1px solid var(--line);margin-top:40px}
.platform-download{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:128px;padding:24px;text-decoration:none;transition:background .16s}
.platform-download:first-child{padding-left:0}
.platform-download+.platform-download{border-left:1px solid var(--line)}
.platform-download:last-child{padding-right:0}
.platform-download:hover{background:#ffffff04}
.platform-download strong{display:block;font-size:17px;font-weight:550;line-height:1.5}
.platform-download small{display:block;font-size:13px;color:var(--muted);line-height:1.6;margin-top:5px}
.download-arrow{display:grid;place-items:center;width:36px;height:36px;flex-shrink:0;border:1px solid var(--line);border-radius:50%;font-size:18px;transition:border-color .16s,color .16s}
.platform-download:hover .download-arrow{border-color:var(--acid);color:var(--acid)}
.download-help{display:flex;align-items:center;justify-content:space-between;gap:12px 24px;flex-wrap:wrap;margin-top:18px}
.download-help .text-link{color:var(--muted)}
.download-help .text-link:hover{color:var(--ink)}
.faq{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.45fr);gap:64px;border-top:1px solid var(--line)}
.faq h2{max-width:360px;font-size:clamp(30px,3.2vw,40px);text-wrap:initial}
.faq-list{border-top:1px solid var(--line)}
.faq details{border-bottom:1px solid var(--line)}
.faq summary{display:flex;justify-content:space-between;align-items:center;gap:20px;min-height:76px;padding:20px 0;font-size:16px;font-weight:500;line-height:1.5;list-style:none;cursor:pointer}
.faq summary::-webkit-details-marker{display:none}
.faq summary>span{font-size:22px;font-weight:400;color:var(--muted);line-height:1;transition:transform .16s;flex-shrink:0}
.faq details[open] summary>span{transform:rotate(45deg);color:var(--ink)}
.faq summary:hover{color:var(--acid)}
.faq-answer{padding:0 32px 22px 0}
.faq-answer p{margin:0;color:var(--muted);font-size:15px;line-height:1.75}
.faq-answer .text-link{margin-top:12px}
.site-footer{border-top:1px solid var(--line)}
.footer-top{display:flex;justify-content:space-between;align-items:flex-start;gap:36px;padding:56px 0 40px}
.footer-identity p{font-size:14px;color:var(--muted);margin:18px 0 0}
.footer-nav{display:flex;align-items:center;gap:28px}
.footer-bottom{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:20px 0 28px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}
.footer-bottom nav{display:flex;gap:24px}
.footer-bottom a{font-size:12px}
.link-list{margin:64px 0 100px;border-top:1px solid var(--line)}
.link-list a{display:grid;grid-template-columns:1fr 1fr auto;gap:30px;align-items:center;min-height:116px;padding:28px 4px;border-bottom:1px solid var(--line);text-decoration:none;transition:background .16s}
.link-list a:hover{background:#ffffff04}
.link-list span{font-size:23px;line-height:1.4;letter-spacing:-.02em}
.link-list small{font-size:14px;color:var(--muted);line-height:1.6}
.link-list b{color:var(--acid);font:12px var(--mono)}
.docs{max-width:900px;padding-bottom:112px}
.docs h1,.narrow h1{font-size:clamp(40px,6vw,72px)}
.docs article{border-top:1px solid var(--line);margin-top:52px;padding-top:12px;max-width:760px}
.docs h2{font-size:28px;margin:36px 0 12px;text-wrap:initial}
.docs article p,.docs li,.docs dd{color:var(--muted);font-size:16px;line-height:1.75}
.docs article a{color:var(--ink)}
.docs pre{max-width:100%;padding:22px;overflow:auto;border:1px solid var(--line);border-radius:6px;background:#0c0c0e;color:var(--ink);font-size:13px;line-height:1.7}
.docs code{font-family:var(--mono);color:#d5d9c8;overflow-wrap:anywhere}
.docs pre code{overflow-wrap:normal}
.docs dt{margin-top:22px}
.docs dd{margin:7px 0 0}
.status{display:flex;align-items:center;gap:13px;padding:22px;border:1px solid var(--line);border-radius:6px;background:var(--panel)}
.status span{width:8px;height:8px;border-radius:50%;background:var(--acid);flex-shrink:0}
.narrow{padding-bottom:100px;min-height:650px}
@media(max-width:1000px){.workflow-step,.faq{gap:36px}.platform-download{padding-inline:18px}.platform-download strong{font-size:15px}.download-arrow{width:30px;height:30px}.footer-nav{gap:22px}}
@media(max-width:767px){
	html{scroll-padding-top:148px}
	main,.header-inner,.site-footer{width:calc(100% - 40px)}
	main:not(.home){padding-top:56px}
	.header-inner{display:grid;grid-template-columns:1fr auto;gap:0;padding-top:12px;padding-bottom:4px}
	.brand img{width:120px}
	.header-download{grid-column:2;grid-row:1}
	.primary-nav{grid-column:1/-1;grid-row:2;justify-content:space-between;gap:20px;margin:6px 0 0;max-width:340px;width:100%}
	.primary-nav a{font-size:13px}
	.hero{padding:60px 0 40px}
	.hero-mark{width:230px;height:230px;right:0;top:82px;opacity:.025}
	h1{font-size:clamp(40px,7vw,54px);line-height:1.12;letter-spacing:-.05em}
	.hero h1{margin-block:22px;max-width:650px}
	.hero .eyebrow{font-size:10px;letter-spacing:.09em;gap:8px}
	.lede{font-size:17px}
	.actions{margin-top:28px;gap:14px 22px}
	.product-overview figcaption{align-items:flex-start;flex-direction:column;gap:0;padding-top:12px}
	.section{padding-block:60px}
	.workflow{padding-bottom:24px}
	.workflow .section-heading{padding-bottom:32px}
	.workflow-step{grid-template-columns:1fr;gap:28px;padding-block:36px}
	.workflow-copy h3{margin-top:16px;max-width:340px}
	.workflow-copy p{max-width:520px}
	.workflow-copy .text-link{margin-top:12px}
	.platform-downloads{grid-template-columns:1fr;margin-top:30px}
	.platform-download,.platform-download:first-child,.platform-download:last-child{padding:22px 0;min-height:104px}
	.platform-download+.platform-download{border-left:0;border-top:1px solid var(--line)}
	.platform-download strong{font-size:17px}
	.download-arrow{width:36px;height:36px}
	.download-help{align-items:flex-start;flex-direction:column;gap:0;margin-top:12px}
	.faq{grid-template-columns:1fr;gap:32px}
	.faq h2{max-width:400px}
	.faq summary{min-height:72px}
	.faq-answer{padding-right:16px}
	.footer-top{flex-direction:column;gap:24px;padding:40px 0 28px}
	.footer-nav{flex-wrap:wrap;gap:6px 24px}
	.footer-bottom{align-items:flex-start;flex-wrap:wrap;gap:4px 20px;padding-block:20px}
	.footer-bottom>span{min-height:44px;display:flex;align-items:center}
	.link-list{margin-block:44px 64px}
	.link-list a{grid-template-columns:minmax(0,1fr) auto;gap:12px 20px;padding-block:24px}
	.link-list small{grid-column:1/3;grid-row:2}
	.link-list span{font-size:21px}
	.docs{padding-bottom:64px}
	.docs article{margin-top:36px}
	.docs h2{font-size:25px}
	.docs pre{padding:16px}
	.narrow{min-height:540px;padding-bottom:64px}
}
@media(max-width:640px){.product-image img{aspect-ratio:7/8}.workspace-detail img{aspect-ratio:7/8;object-position:center}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{transition:none!important;animation:none!important}.button:hover{transform:none}}
`;
