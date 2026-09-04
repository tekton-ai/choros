import { COMPANY } from "@choros/shared/constants";
import {
	DropdownMenuItem,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@choros/ui/dropdown-menu";
import { Trans } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { FaDiscord, FaGithub, FaXTwitter } from "react-icons/fa6";
import {
	HiOutlineBookOpen,
	HiOutlineChatBubbleLeftRight,
	HiOutlineEnvelope,
	HiOutlineQuestionMarkCircle,
} from "react-icons/hi2";
import { IoBugOutline } from "react-icons/io5";
import { LuKeyboard } from "react-icons/lu";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";

export function HelpSubMenu() {
	const navigate = useNavigate();
	const shortcutsHotkey = useHotkeyDisplay("SHOW_HOTKEYS").text;
	const openUrlMutation = electronTrpc.external.openUrl.useMutation();

	const openExternal = (url: string) => {
		openUrlMutation.mutate(url);
	};

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger>
				<HiOutlineQuestionMarkCircle className="h-4 w-4" />
				<span>
					<Trans id="dashboard.topBar.helpMenu.help">Help</Trans>
				</span>
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="w-56">
				<DropdownMenuItem onSelect={() => openExternal(COMPANY.DOCS_URL)}>
					<HiOutlineBookOpen className="h-4 w-4" />
					<Trans id="dashboard.topBar.helpMenu.documentation">
						Documentation
					</Trans>
				</DropdownMenuItem>
				<DropdownMenuItem
					onSelect={() => navigate({ to: "/settings/keyboard" })}
				>
					<LuKeyboard className="h-4 w-4" />
					<Trans id="dashboard.topBar.helpMenu.keyboardShortcuts">
						Keyboard Shortcuts
					</Trans>
					{shortcutsHotkey !== "Unassigned" && (
						<DropdownMenuShortcut>{shortcutsHotkey}</DropdownMenuShortcut>
					)}
				</DropdownMenuItem>
				<DropdownMenuItem
					onSelect={() => openExternal(COMPANY.REPORT_ISSUE_URL)}
				>
					<IoBugOutline className="h-4 w-4" />
					<Trans id="dashboard.topBar.helpMenu.reportIssue">Report Issue</Trans>
				</DropdownMenuItem>
				<DropdownMenuSub>
					<DropdownMenuSubTrigger>
						<HiOutlineChatBubbleLeftRight className="h-4 w-4" />
						<Trans id="dashboard.topBar.helpMenu.contactUs">Contact Us</Trans>
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent sideOffset={8} className="w-56">
						<DropdownMenuItem onSelect={() => openExternal(COMPANY.GITHUB_URL)}>
							<FaGithub className="h-4 w-4" />
							<Trans id="dashboard.topBar.helpMenu.github">GitHub</Trans>
						</DropdownMenuItem>
						<DropdownMenuItem
							onSelect={() => openExternal(COMPANY.DISCORD_URL)}
						>
							<FaDiscord className="h-4 w-4" />
							<Trans id="dashboard.topBar.helpMenu.discord">Discord</Trans>
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => openExternal(COMPANY.X_URL)}>
							<FaXTwitter className="h-4 w-4" />
							{/* Brand name — never translated (glossary). */}
							{"X"}
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => openExternal(COMPANY.MAIL_TO)}>
							<HiOutlineEnvelope className="h-4 w-4" />
							<Trans id="dashboard.topBar.helpMenu.emailSupport">
								Email Support
							</Trans>
						</DropdownMenuItem>
					</DropdownMenuSubContent>
				</DropdownMenuSub>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}
