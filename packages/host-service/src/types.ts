import type { ChatService } from "@choros/provider-auth/server";
import type { Octokit } from "@octokit/rest";
import type { HostDb } from "./db";
import type { EventBus } from "./events";
import type { WorkspaceFilesystemManager } from "./runtime/filesystem";
import type { GitCredentialProvider, GitFactory } from "./runtime/git";
import type { PullRequestRuntimeManager } from "./runtime/pull-requests";
import type { TerminalAgentStore } from "./terminal-agents";
import type { ExecGh } from "./trpc/router/workspace-creation/utils/exec-gh";

export interface HostServiceRuntime {
	auth: ChatService;
	filesystem: WorkspaceFilesystemManager;
	pullRequests: PullRequestRuntimeManager;
}

export interface HostServiceContext {
	git: GitFactory;
	credentials: GitCredentialProvider;
	github: () => Promise<Octokit>;
	execGh: ExecGh;
	db: HostDb;
	runtime: HostServiceRuntime;
	eventBus: EventBus;
	terminalAgentStore: TerminalAgentStore;
	isAuthenticated: boolean;
	clientMachineId?: string;
	/** Present only when a desktop app spawned this host (has browser panes). */
	browserBridge?: BrowserBridgeConfig;
}

export interface BrowserBridgeConfig {
	url: string;
	secret: string;
}
