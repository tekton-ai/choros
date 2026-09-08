// Launched through the app's real terminal. No Host/port-detection mocks.
const [markerPath, label] = process.argv.slice(2);
if (!markerPath || !label)
	throw new Error("Usage: port-server.ts <marker-path> <label>");
const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	fetch: () => new Response(label),
});
await Bun.write(
	markerPath,
	JSON.stringify({ port: server.port, pid: process.pid, label }),
);
console.log(`${label} listening at http://127.0.0.1:${server.port}`);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		server.stop(true);
		process.exit(0);
	});
}
