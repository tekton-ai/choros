import type { ReactNode } from "react";
import { useWorkspaceEvent } from "renderer/hooks/host-service/use-workspace-event";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/workspace-provider";
import { dispatchFsEvent } from "./file-document-store";

export function FileDocumentStoreProvider({
	children,
}: {
	children: ReactNode;
}) {
	const { workspace } = useWorkspace();
	useWorkspaceEvent("fs:events", workspace.id, (event) => {
		dispatchFsEvent(workspace.id, event);
	});

	return <>{children}</>;
}
