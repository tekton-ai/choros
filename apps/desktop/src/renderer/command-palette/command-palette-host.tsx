import { type ReactNode, useEffect } from "react";
import { CommandContextProvider } from "./core/context-provider";
import { registerAllModules } from "./modules";
import { CommandPalette } from "./ui/command-palette/command-palette";
import { CommandPaletteTrigger } from "./ui/command-palette-trigger/command-palette-trigger";
import { DeleteWorkspaceMount } from "./ui/delete-workspace-mount/delete-workspace-mount";
import { FolderImportMount } from "./ui/folder-import-mount/folder-import-mount";
import { QuickCreateWorkspaceMount } from "./ui/quick-create-workspace-mount/quick-create-workspace-mount";
import { RemoveFromSidebarMount } from "./ui/remove-from-sidebar-mount/remove-from-sidebar-mount";
import { SetPreferredOpenInAppMount } from "./ui/set-preferred-open-in-app-mount/set-preferred-open-in-app-mount";

export function CommandPaletteHost({ children }: { children?: ReactNode }) {
	useEffect(() => {
		const unregister = registerAllModules();
		return unregister;
	}, []);

	return (
		<CommandContextProvider>
			<CommandPaletteTrigger />
			<CommandPalette />
			<DeleteWorkspaceMount />
			<RemoveFromSidebarMount />
			<SetPreferredOpenInAppMount />
			<FolderImportMount />
			<QuickCreateWorkspaceMount />
			{children}
		</CommandContextProvider>
	);
}
