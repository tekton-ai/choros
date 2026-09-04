import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import {
	BeakerIcon,
	BellIcon,
	BookmarkIcon,
	ChartBarIcon,
	CpuIcon,
	FolderIcon,
	GitBranchIcon,
	KeyboardIcon,
	type LucideIcon,
	PaletteIcon,
	SlidersIcon,
	TerminalIcon,
	UserIcon,
	WrenchIcon,
} from "lucide-react";
import type { Command } from "../../core/types";

interface SettingsTab {
	id: string;
	title: MessageDescriptor;
	path: string;
	icon: LucideIcon;
	keywords?: string[];
}

const TABS: SettingsTab[] = [
	{
		id: "account",
		title: msg({
			id: "commandPalette.settingsTab.account",
			message: "Account",
		}),
		path: "/settings/account",
		icon: UserIcon,
	},
	{
		id: "appearance",
		title: msg({
			id: "commandPalette.settingsTab.appearance",
			message: "Appearance",
		}),
		path: "/settings/appearance",
		icon: PaletteIcon,
		keywords: ["theme", "color"],
	},
	{
		id: "behavior",
		title: msg({
			id: "commandPalette.settingsTab.behavior",
			message: "Behavior",
		}),
		path: "/settings/behavior",
		icon: SlidersIcon,
	},
	{
		id: "models",
		title: msg({ id: "commandPalette.settingsTab.models", message: "Models" }),
		path: "/settings/models",
		icon: CpuIcon,
		keywords: ["ai", "llm"],
	},
	{
		id: "terminal",
		title: msg({
			id: "commandPalette.settingsTab.terminal",
			message: "Terminal",
		}),
		path: "/settings/terminal",
		icon: TerminalIcon,
		keywords: ["terminal scripts", "scripts", "presets", "commands"],
	},
	{
		id: "git",
		title: msg({ id: "commandPalette.settingsTab.git", message: "Git" }),
		path: "/settings/git",
		icon: GitBranchIcon,
	},
	{
		id: "experimental",
		title: msg({
			id: "commandPalette.settingsTab.experimental",
			message: "Experimental",
		}),
		path: "/settings/experimental",
		icon: BeakerIcon,
	},
	{
		id: "keyboard",
		title: msg({
			id: "commandPalette.settingsTab.keyboard",
			message: "Keyboard shortcuts",
		}),
		path: "/settings/keyboard",
		icon: KeyboardIcon,
		keywords: ["hotkeys", "shortcuts"],
	},
	{
		id: "links",
		title: msg({ id: "commandPalette.settingsTab.links", message: "Links" }),
		path: "/settings/links",
		icon: BookmarkIcon,
	},
	{
		id: "projects",
		title: msg({
			id: "commandPalette.settingsTab.projects",
			message: "Projects",
		}),
		path: "/settings/projects",
		icon: FolderIcon,
	},
	{
		id: "ringtones",
		title: msg({
			id: "commandPalette.settingsTab.ringtones",
			message: "Ringtones",
		}),
		path: "/settings/ringtones",
		icon: BellIcon,
	},
	{
		id: "usage",
		title: msg({ id: "commandPalette.settingsTab.usage", message: "Usage" }),
		path: "/settings/usage",
		icon: ChartBarIcon,
		keywords: ["tokens", "cost", "quota", "cpu", "memory", "resources"],
	},
	{
		id: "agents",
		title: msg({ id: "commandPalette.settingsTab.agents", message: "Agents" }),
		path: "/settings/agents",
		icon: WrenchIcon,
	},
];

function tabToCommand(tab: SettingsTab): Command {
	return {
		id: `settings.${tab.id}`,
		title: tab.title,
		section: "navigation",
		icon: tab.icon,
		keywords: tab.keywords,
		run: (ctx) => ctx.navigate(tab.path),
	};
}

export const settingsTabCommands = TABS.map(tabToCommand);
