import { TRPCError } from "@trpc/server";
import { AutomationRuntimeError } from "../../../runtime/automations";

function trpcCode(
	error: AutomationRuntimeError,
): "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST" {
	switch (error.code) {
		case "NOT_FOUND":
			return "NOT_FOUND";
		case "VERSION_CONFLICT":
		case "REQUEST_CONFLICT":
		case "CONFIRMATION_CONSUMED":
		case "RUN_BUSY":
			return "CONFLICT";
		default:
			return "BAD_REQUEST";
	}
}

export async function invokeAutomation<T>(
	operation: () => T | Promise<T>,
): Promise<T> {
	try {
		return await operation();
	} catch (error) {
		if (error instanceof AutomationRuntimeError) {
			throw new TRPCError({
				code: trpcCode(error),
				message: `${error.code}: ${error.message}`,
				cause: error,
			});
		}
		throw error;
	}
}
