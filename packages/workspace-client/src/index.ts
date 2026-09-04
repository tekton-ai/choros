export { useEventBus } from "./hooks/use-event-bus";
export { useGitChangeEvents } from "./hooks/use-git-change-events";
export {
	type AgentBindingsChangedPayload,
	type AgentIdentity,
	type AgentLifecyclePayload,
	type EventBusHandle,
	type GitChangedPayload,
	getEventBus,
	type HostConnectionState,
	type HostConnectionStatus,
	type PortChangedPayload,
	type ProjectChangedPayload,
	type ProjectSnapshotPayload,
	reconnectEventBusIfDown,
	type TerminalLifecyclePayload,
	type WorkspaceChangedPayload,
	type WorkspaceCreateSettledPayload,
	type WorkspaceSnapshotPayload,
} from "./lib/event-bus";
export {
	primeRelayAffinity,
	type RelayAffinityProbe,
} from "./lib/prime-relay-affinity";
export {
	createRelaySocket,
	type RelaySocket,
	type RelaySocketOptions,
} from "./lib/relay-socket";
export {
	useMaybeWorkspaceClient,
	useWorkspaceClient,
	useWorkspaceHostUrl,
	useWorkspaceWsUrl,
	type WorkspaceClientContextValue,
	WorkspaceClientProvider,
} from "./providers/workspace-client-provider";
export { workspaceTrpc } from "./workspace-trpc";
