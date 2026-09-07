import { msg } from "@lingui/core/macro";
import {
	ArrowLeftIcon,
	ArrowRightIcon,
	LayersIcon,
	PlusIcon,
} from "lucide-react";
import type { CommandProvider } from "../../core/types";

export const profilesProvider: CommandProvider = {
	id: "profiles",
	provide: () => [
		{
			id: "profiles.new",
			title: msg({
				id: "commandPalette.profile.new",
				message: "New Profile",
			}),
			section: "actions",
			icon: PlusIcon,
			keywords: ["profile", "create", "work"],
			when: (context) => context.profile.available,
			run: (context) => context.profile.openCreate(),
		},
		{
			id: "profiles.manage",
			title: msg({
				id: "commandPalette.profile.manage",
				message: "Manage Profiles",
			}),
			section: "actions",
			icon: LayersIcon,
			keywords: ["profile", "rename", "move", "sort"],
			run: (context) => context.profile.openManager(),
		},
		{
			id: "profiles.previous",
			title: msg({
				id: "commandPalette.profile.previous",
				message: "Previous Profile",
			}),
			section: "actions",
			icon: ArrowLeftIcon,
			keywords: ["profile", "switch"],
			run: (context) => {
				if (context.profile.previousId) {
					context.profile.select(context.profile.previousId);
				}
			},
		},
		{
			id: "profiles.next",
			title: msg({
				id: "commandPalette.profile.next",
				message: "Next Profile",
			}),
			section: "actions",
			icon: ArrowRightIcon,
			keywords: ["profile", "switch"],
			run: (context) => {
				if (context.profile.nextId) {
					context.profile.select(context.profile.nextId);
				}
			},
		},
	],
};
