(() => {
	const toggle = document.querySelector("[data-motion-toggle]");
	if (
		!(toggle instanceof HTMLInputElement) ||
		!("IntersectionObserver" in window)
	)
		return;
	const control = toggle.closest(".motion-control");
	if (!control) return;
	const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
	const scenes = new Map();

	for (const element of document.querySelectorAll("[data-motion-scene]")) {
		const sources = [];
		for (const image of element.querySelectorAll("source, img")) {
			for (const attribute of ["src", "srcset"]) {
				const paused = image.getAttribute(attribute);
				if (!paused) continue;
				// Authored SVG URLs and optional width descriptors only, not data URLs.
				const playing = paused
					.split(",")
					.map((candidate) => {
						const [source, ...descriptor] = candidate.trim().split(/\s+/);
						const url = new URL(source, document.baseURI);
						url.searchParams.set("motion", "play");
						url.hash = "";
						return [url.href, ...descriptor].join(" ");
					})
					.join(", ");
				sources.push({ image, attribute, paused, playing });
			}
		}
		scenes.set(element, { sources, visible: false, playing: false });
	}

	function update(scene) {
		const playing =
			scene.visible &&
			toggle.checked &&
			!reducedMotion.matches &&
			!document.hidden;
		if (scene.playing === playing) return;
		scene.playing = playing;
		for (const source of scene.sources) {
			source.image.setAttribute(
				source.attribute,
				playing ? source.playing : source.paused,
			);
		}
	}

	function refresh() {
		control.hidden = reducedMotion.matches;
		for (const scene of scenes.values()) update(scene);
	}

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				const scene = scenes.get(entry.target);
				scene.visible = entry.isIntersecting && entry.intersectionRatio >= 0.05;
				update(scene);
			}
		},
		{ threshold: 0.05 },
	);

	for (const element of scenes.keys()) observer.observe(element);
	toggle.addEventListener("change", refresh);
	reducedMotion.addEventListener("change", refresh);
	document.addEventListener("visibilitychange", refresh);
	refresh();
})();
