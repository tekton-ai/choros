import { beforeEach, describe, expect, it, mock } from "bun:test";
import * as queryActual from "@tanstack/react-query";
import * as reactActual from "react";
import * as gitInitConfirmActual from "renderer/stores/git-init-confirm";
import type {
	ProfileMemberRef,
	ProfileSubmissionContext,
} from "shared/profiles";

const hostUrl = "http://host-service";
const repoPath = "/repos/octocat";
const setupResult = { repoPath, mainWorkspaceId: "workspace-1" };
const cloudError = {
	url: "https://github.com/octocat/hello.git",
	message: "cloud-down",
};
const ownership = new Map<string, string>();
let activeProfileId = "profile-a";
let assignmentFails = false;
let submissionNumber = 0;
const selectDirectoryMock = mock(async () => ({
	canceled: false,
	path: repoPath,
}));
const findByPathMock = mock(
	async (): Promise<{
		candidates: { id: string; name: string }[];
		cloudErrors: (typeof cloudError)[];
		needsGitInit?: boolean;
	}> => ({ candidates: [], cloudErrors: [] }),
);
const setupMock = mock(async () => setupResult);
const createdProject = {
	projectId: "created-project",
	repoPath,
	mainWorkspaceId: "workspace-created",
	created: true,
};
const createMock = mock(async () => createdProject);
const requestGitInitMock = mock(async () => false);
const assignCreatedMember = mock(
	async (member: ProfileMemberRef, context: ProfileSubmissionContext) => {
		if (assignmentFails) return { profileId: "default", assigned: false };
		if (member.kind === "project")
			ownership.set(member.projectKey, context.profileId);
		return { profileId: context.profileId, assigned: true };
	},
);

mock.module("react", () => ({
	...reactActual,
	useCallback: <T extends (...args: never[]) => unknown>(callback: T) =>
		callback,
}));
mock.module("@tanstack/react-query", () => ({
	...queryActual,
	useQueryClient: () => ({ invalidateQueries: async () => undefined }),
}));
mock.module(
	"renderer/routes/_authenticated/hooks/use-dashboard-sidebar-state",
	() => ({
		useDashboardSidebarState: () => ({
			ensureProjectInSidebar: () => undefined,
			ensureWorkspaceInSidebar: () => undefined,
		}),
	}),
);
mock.module(
	"renderer/routes/_authenticated/providers/profile-provider",
	() => ({
		useProfiles: () => ({
			defaultProfileId: "default",
			captureSubmission: (): ProfileSubmissionContext => ({
				profileId: activeProfileId,
				requestId: String(++submissionNumber),
				generation: 0,
			}),
			getProjectProfileId: (projectId: string) =>
				ownership.get(projectId) ?? "default",
			assignCreatedMember,
			registerPendingMember: () => () => undefined,
		}),
	}),
);
mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		window: {
			selectDirectory: {
				useMutation: () => ({ mutateAsync: selectDirectoryMock }),
			},
		},
	},
}));
mock.module("renderer/lib/host-service-client", () => ({
	getHostServiceClientByUrl: () => ({
		project: {
			findByPath: { query: findByPathMock },
			setup: { mutate: setupMock },
			create: { mutate: createMock },
		},
	}),
}));
mock.module(
	"renderer/routes/_authenticated/providers/local-host-service-provider",
	() => ({
		useLocalHostService: () => ({
			activeHostUrl: hostUrl,
			waitForHostReady: async () => hostUrl,
		}),
	}),
);
mock.module("renderer/stores/git-init-confirm", () => ({
	...gitInitConfirmActual,
	useRequestGitInitConfirm: () => requestGitInitMock,
}));

const { useFinalizeProjectSetup } = await import(
	"renderer/react-query/projects/use-finalize-project-setup/use-finalize-project-setup"
);
mock.module("renderer/react-query/projects", () => ({
	useFinalizeProjectSetup,
}));
const { useFolderFirstImport } = await import("./use-folder-first-import");

describe("useFolderFirstImport", () => {
	beforeEach(() => {
		for (const fn of [
			selectDirectoryMock,
			findByPathMock,
			setupMock,
			createMock,
			requestGitInitMock,
			assignCreatedMember,
		]) {
			fn.mockClear();
		}
		selectDirectoryMock.mockResolvedValue({ canceled: false, path: repoPath });
		findByPathMock.mockResolvedValue({ candidates: [], cloudErrors: [] });
		createMock.mockResolvedValue(createdProject);
		requestGitInitMock.mockResolvedValue(false);
		ownership.clear();
		activeProfileId = "profile-a";
		assignmentFails = false;
	});

	it("does not create a duplicate when candidate lookup fails", async () => {
		findByPathMock.mockResolvedValue({
			candidates: [],
			cloudErrors: [cloudError],
		});
		const onError = mock(() => undefined);
		expect(await useFolderFirstImport({ onError }).start()).toBeNull();
		expect(onError).toHaveBeenCalledTimes(1);
		expect(createMock).not.toHaveBeenCalled();
		expect(setupMock).not.toHaveBeenCalled();
	});

	it("initializes a non-git folder only with confirmation and classifies the new project", async () => {
		findByPathMock.mockResolvedValue({
			candidates: [],
			cloudErrors: [],
			needsGitInit: true,
		});
		requestGitInitMock.mockResolvedValue(true);
		const result = await useFolderFirstImport().start();
		expect(createMock).toHaveBeenCalledWith({
			name: "octocat",
			mode: { kind: "importLocal", repoPath, initIfNeeded: true },
		});
		expect(result?.created).toBe(true);
		expect(result?.profileId).toBe("profile-a");
		expect(ownership.get("created-project")).toBe("profile-a");
	});

	it("does not create a project when git initialization is declined", async () => {
		findByPathMock.mockResolvedValue({
			candidates: [],
			cloudErrors: [],
			needsGitInit: true,
		});
		expect(await useFolderFirstImport().start()).toBeNull();
		expect(createMock).not.toHaveBeenCalled();
		expect(assignCreatedMember).not.toHaveBeenCalled();
	});

	it("retains prior ownership when lookup is empty but Host create returns created:false", async () => {
		ownership.set("created-project", "profile-b");
		createMock.mockResolvedValue({ ...createdProject, created: false });
		const result = await useFolderFirstImport().start();
		expect(result?.created).toBe(false);
		expect(result?.profileId).toBe("profile-b");
		expect(ownership.get("created-project")).toBe("profile-b");
		expect(assignCreatedMember).not.toHaveBeenCalled();
	});

	it("preserves the owner of an existing project setup", async () => {
		ownership.set("existing-project", "profile-b");
		findByPathMock.mockResolvedValue({
			candidates: [{ id: "existing-project", name: "Existing" }],
			cloudErrors: [],
		});
		const result = await useFolderFirstImport().start();
		expect(result?.projectId).toBe("existing-project");
		expect(result?.created).toBe(false);
		expect(result?.profileId).toBe("profile-b");
		expect(createMock).not.toHaveBeenCalled();
		expect(assignCreatedMember).not.toHaveBeenCalled();
	});

	it("captures the Profile before waiting for the native folder picker", async () => {
		selectDirectoryMock.mockImplementationOnce(async () => {
			activeProfileId = "profile-b";
			return { canceled: false, path: repoPath };
		});
		const result = await useFolderFirstImport().start();
		expect(result?.profileId).toBe("profile-a");
		expect(ownership.get("created-project")).toBe("profile-a");
	});

	it("returns the successful Default object after classification failure without retrying Host create", async () => {
		assignmentFails = true;
		const onError = mock(() => undefined);
		const result = await useFolderFirstImport({ onError }).start();
		expect(result?.projectId).toBe("created-project");
		expect(result?.profileId).toBe("default");
		expect(result?.assignment?.assigned).toBe(false);
		expect(createMock).toHaveBeenCalledTimes(1);
		expect(onError).not.toHaveBeenCalled();
	});
});
