import { handlePublicSiteRequest } from "./site";

const port = Number(process.env.PORT ?? 4173);

const server = Bun.serve({
	port,
	fetch(request) {
		return handlePublicSiteRequest(new URL(request.url).pathname);
	},
});

console.log(`Choros site available at ${server.url}`);
