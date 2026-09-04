import { Avatar } from "@choros/ui/atoms/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@choros/ui/dropdown-menu";
import { toast } from "@choros/ui/sonner";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import {
	HiChevronUpDown,
	HiOutlineArrowRightOnRectangle,
	HiOutlineUserCircle,
	HiOutlineWindow,
} from "react-icons/hi2";
import { useSignOut } from "renderer/hooks/use-sign-out";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { HelpSubMenu } from "./components/help-sub-menu";

export function OrganizationDropdown({
	variant = "topbar",
}: {
	variant?: "topbar" | "expanded" | "collapsed";
}) {
	const { t } = useLingui();
	const { data: session } = authClient.useSession();
	const signOut = useSignOut();
	const navigate = useNavigate();
	const openNewWindow = electronTrpc.window.openNew.useMutation({
		onError: (error) =>
			toast.error(
				t({
					id: "dashboard.topBar.organizationDropdown.openWindowFailed",
					message: `Failed to open new window: ${error.message}`,
				}),
			),
	});

	const userName = session?.user?.name;
	const userEmail = session?.user?.email;
	const displayName =
		userName ??
		userEmail ??
		t({
			id: "dashboard.topBar.organizationDropdown.accountFallback",
			message: "Account",
		});
	const avatar = (
		<Avatar
			size="xs"
			fullName={userName}
			image={session?.user?.image ?? undefined}
			className="rounded size-4"
		/>
	);

	const triggerButton =
		variant === "collapsed" ? (
			<button
				type="button"
				className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover"
				aria-label={t({
					id: "dashboard.topBar.organizationDropdown.accountMenuCollapsed",
					message: "Account menu",
				})}
			>
				{avatar}
			</button>
		) : variant === "expanded" ? (
			<button
				type="button"
				className="group flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
				aria-label={t({
					id: "dashboard.topBar.organizationDropdown.accountMenuExpanded",
					message: "Account menu",
				})}
			>
				{avatar}
				<span className="truncate">{displayName}</span>
			</button>
		) : (
			<button
				type="button"
				className="group no-drag flex h-6 items-center gap-1.5 rounded border border-border/60 bg-secondary/50 px-1.5 transition-all duration-150 ease-out hover:border-border hover:bg-secondary focus:outline-none focus:ring-1 focus:ring-ring"
				aria-label={t({
					id: "dashboard.topBar.organizationDropdown.accountMenuTopbar",
					message: "Account menu",
				})}
			>
				{avatar}
				<span className="max-w-32 truncate text-xs font-medium">
					{displayName}
				</span>
				<HiChevronUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
			</button>
		);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
			<DropdownMenuContent
				align={variant === "topbar" ? "end" : "start"}
				className={
					variant === "expanded"
						? "w-[var(--radix-dropdown-menu-trigger-width)] min-w-56"
						: "w-56"
				}
			>
				<DropdownMenuItem
					onSelect={() => navigate({ to: "/settings/account" })}
				>
					<HiOutlineUserCircle className="h-4 w-4" />
					<span>
						<Trans id="dashboard.topBar.orgDropdown.account">Account</Trans>
					</span>
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={() => openNewWindow.mutate()}>
					<HiOutlineWindow className="h-4 w-4" />
					<span>
						<Trans id="dashboard.topBar.orgDropdown.newWindow">
							New window
						</Trans>
					</span>
				</DropdownMenuItem>
				<HelpSubMenu />
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={() => void signOut()} className="gap-2">
					<HiOutlineArrowRightOnRectangle className="h-4 w-4" />
					<span>
						<Trans id="dashboard.topBar.orgDropdown.logOut">Log out</Trans>
					</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
