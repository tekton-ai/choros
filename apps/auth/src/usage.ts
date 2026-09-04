import { z } from "zod";

const appVersionSchema = z
	.string()
	.min(1)
	.max(50)
	.regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);

const platformSchema = z.enum([
	"darwin-arm64",
	"darwin-x64",
	"linux-arm64",
	"linux-x64",
	"win32-arm64",
	"win32-x64",
]);

export const usageEventInputSchema = z.strictObject({
	id: z.uuid(),
	event: z.literal("desktop_opened"),
	occurredAt: z.iso.datetime({ offset: true }),
	appVersion: appVersionSchema,
	platform: platformSchema,
	schemaVersion: z.literal(1),
});

export type UsageEventInput = z.infer<typeof usageEventInputSchema>;

export interface UsageEventRecord extends Omit<UsageEventInput, "occurredAt"> {
	userId: string;
	occurredAt: Date;
}

interface UsageRouteDependencies {
	getUserId(headers: Headers): Promise<string | null>;
	insertEvent(event: UsageEventRecord): Promise<void>;
}

export async function handleUsageEvent(
	request: Request,
	dependencies: UsageRouteDependencies,
): Promise<Response> {
	const userId = await dependencies.getUserId(request.headers);
	if (!userId) {
		return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return Response.json({ code: "INVALID_JSON" }, { status: 400 });
	}

	const parsed = usageEventInputSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json({ code: "INVALID_USAGE_EVENT" }, { status: 400 });
	}

	await dependencies.insertEvent({
		...parsed.data,
		userId,
		occurredAt: new Date(parsed.data.occurredAt),
	});
	return new Response(null, { status: 204 });
}
