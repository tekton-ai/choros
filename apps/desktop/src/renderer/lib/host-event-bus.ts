import { type EventBusHandle, getEventBus } from "@choros/workspace-client";
import {
	getHostServiceWsToken,
	getHostServiceWsUrlParams,
} from "./host-service-auth";

/** Returns the singleton local host event bus with its loopback PSK. */
export function getHostEventBus(hostUrl: string): EventBusHandle {
	return getEventBus(
		hostUrl,
		() => getHostServiceWsToken(hostUrl),
		() => getHostServiceWsUrlParams(),
	);
}
