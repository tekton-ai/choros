"use client";

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { authClient } from "@choros/auth/client";
import { i18n } from "@choros/i18n";
import { isPaidPlan } from "@choros/shared/billing";
import { Avatar, AvatarFallback, AvatarImage } from "@choros/ui/avatar";
import { Badge } from "@choros/ui/badge";
import { Drawer, DrawerContent, DrawerTitle } from "@choros/ui/drawer";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@choros/ui/dropdown-menu";
import { useIsMobile } from "@choros/ui/hooks/use-mobile";
import { toast } from "@choros/ui/sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { useTRPC } from "@/trpc/react";

const navItems: { label: MessageDescriptor; href: string }[] = [
	{
		label: msg({ id: "web.agentsHeader.navAgents", message: "Agents" }),
		href: "/agents",
	},
	{
		label: msg({
			id: "web.agentsHeader.navIntegrations",
			message: "Integrations",
		}),
		href: "/integrations",
	},
];

export function AgentsHeader() {
	const { t } = useLingui();
	const { data: session } = authClient.useSession();
	const router = useRouter();
	const pathname = usePathname();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const isMobile = useIsMobile();
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const [actionInFlight, setActionInFlight] = useState(false);

	const { data: organizations } = useQuery(
		trpc.user.myOrganizations.queryOptions(),
	);

	const { data: activePlan } = useQuery(trpc.billing.activePlan.queryOptions());

	const isPro = isPaidPlan(activePlan?.plan);
	const planLabel =
		isPro && activePlan?.plan
			? activePlan.plan.charAt(0).toUpperCase() + activePlan.plan.slice(1)
			: null;

	const user = session?.user;
	const activeOrganizationId = session?.session?.activeOrganizationId;
	const activeOrganization = organizations?.find(
		(org) => org.id === activeOrganizationId,
	);

	const displayName =
		activeOrganization?.name ??
		t({ id: "web.agentsHeader.organizationFallback", message: "Organization" });

	// `context` stays English for the log; `message` is what the user reads.
	const handleActionError = (
		context: string,
		message: string,
		error: unknown,
	) => {
		console.error(`[AgentsHeader] ${context}`, error);
		toast.error(message);
	};

	const handleSignOut = async () => {
		try {
			await authClient.signOut();
			return true;
		} catch (error) {
			handleActionError(
				"sign out failed",
				t({
					id: "web.agentsHeader.signOutError",
					message: "Failed to log out. Please try again.",
				}),
				error,
			);
			return false;
		}
	};

	const handleSwitchOrganization = async (organizationId: string) => {
		if (organizationId === activeOrganizationId) {
			return true;
		}

		try {
			await authClient.organization.setActive({ organizationId });
			await queryClient.invalidateQueries();
			router.refresh();
			return true;
		} catch (error) {
			handleActionError(
				"switch organization failed",
				t({
					id: "web.agentsHeader.switchOrganizationError",
					message: "Failed to switch organization. Please try again.",
				}),
				error,
			);
			return false;
		}
	};

	const handleDrawerSignOut = async () => {
		if (actionInFlight) {
			return;
		}

		setActionInFlight(true);

		try {
			const signedOut = await handleSignOut();
			if (!signedOut) {
				return;
			}

			setDrawerOpen(false);
			router.push("/sign-in");
		} finally {
			setActionInFlight(false);
		}
	};

	const handleDrawerOrganizationSelect = async (organizationId: string) => {
		if (actionInFlight) {
			return;
		}

		setActionInFlight(true);

		try {
			const switched = await handleSwitchOrganization(organizationId);
			if (switched) {
				setDrawerOpen(false);
			}
		} finally {
			setActionInFlight(false);
		}
	};

	const handleDropdownSignOut = async () => {
		if (actionInFlight) {
			return;
		}

		setActionInFlight(true);

		try {
			const signedOut = await handleSignOut();
			if (!signedOut) {
				return;
			}

			setDropdownOpen(false);
			router.push("/sign-in");
		} finally {
			setActionInFlight(false);
		}
	};

	const handleDropdownOrganizationSelect = async (organizationId: string) => {
		if (actionInFlight) {
			return;
		}

		setActionInFlight(true);

		try {
			const switched = await handleSwitchOrganization(organizationId);
			if (switched) {
				setDropdownOpen(false);
			}
		} finally {
			setActionInFlight(false);
		}
	};

	const triggerButton = (
		<button
			type="button"
			className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-secondary/50 px-3 py-1.5 transition-all duration-150 hover:border-border hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			aria-label={t({
				id: "web.agentsHeader.organizationMenuLabel",
				message: `Organization menu for ${displayName}`,
			})}
			onClick={isMobile ? () => setDrawerOpen(true) : undefined}
		>
			<Avatar className="size-5">
				<AvatarImage
					src={activeOrganization?.logo ?? undefined}
					alt={displayName}
				/>
				<AvatarFallback className="text-[10px]">
					{displayName.charAt(0)}
				</AvatarFallback>
			</Avatar>
			<span className="max-w-32 truncate text-sm font-medium">
				{displayName}
			</span>
			<ChevronDown className="size-4 text-muted-foreground" />
		</button>
	);

	const orgMenu = isMobile ? (
		<>
			{triggerButton}
			<Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
				<DrawerContent>
					<DrawerTitle className="sr-only">
						<Trans id="web.agentsHeader.accountMenu">Account menu</Trans>
					</DrawerTitle>
					<div className="flex flex-col gap-1 p-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
						<div className="flex flex-col space-y-1 px-2 py-1.5">
							<div className="flex items-center gap-2">
								<p className="text-sm font-medium">{user?.name}</p>
								{isPro && (
									<Badge variant="default" className="px-1.5 py-0 text-[10px]">
										{planLabel}
									</Badge>
								)}
							</div>
							<p className="text-xs text-muted-foreground">{user?.email}</p>
						</div>
						<div className="my-1 h-px bg-border" />
						{organizations && organizations.length > 1 && (
							<>
								<p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
									<Trans id="web.agentsHeader.switchOrganization">
										Switch organization
									</Trans>
								</p>
								{organizations.map((org) => (
									<button
										key={org.id}
										type="button"
										className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
										disabled={actionInFlight}
										onClick={() => {
											void handleDrawerOrganizationSelect(org.id);
										}}
									>
										<Avatar className="size-4">
											<AvatarImage
												src={org.logo ?? undefined}
												alt={
													org.name ??
													t({
														id: "web.agentsHeader.organizationFallback",
														message: "Organization",
													})
												}
											/>
											<AvatarFallback className="text-[8px]">
												{org.name?.charAt(0) ?? "O"}
											</AvatarFallback>
										</Avatar>
										<span className="flex-1 truncate text-left">
											{org.name}
										</span>
										{org.id === activeOrganizationId && (
											<Check className="size-4 text-primary" />
										)}
									</button>
								))}
								<div className="my-1 h-px bg-border" />
							</>
						)}
						<button
							type="button"
							className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
							disabled={actionInFlight}
							onClick={() => {
								void handleDrawerSignOut();
							}}
						>
							<LogOut className="size-4" />
							<span>
								<Trans id="web.agentsHeader.logOut">Log out</Trans>
							</span>
						</button>
					</div>
				</DrawerContent>
			</Drawer>
		</>
	) : (
		<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
			<DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-56">
				<DropdownMenuLabel>
					<div className="flex flex-col space-y-1">
						<div className="flex items-center gap-2">
							<p className="text-sm font-medium">{user?.name}</p>
							{isPro && (
								<Badge variant="default" className="px-1.5 py-0 text-[10px]">
									{planLabel}
								</Badge>
							)}
						</div>
						<p className="text-xs text-muted-foreground">{user?.email}</p>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{organizations && organizations.length > 1 && (
					<>
						<DropdownMenuSub>
							<DropdownMenuSubTrigger className="cursor-pointer">
								<span>
									<Trans id="web.agentsHeader.switchOrganization">
										Switch organization
									</Trans>
								</span>
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent>
								<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
									{user?.email}
								</DropdownMenuLabel>
								{organizations.map((org) => (
									<DropdownMenuItem
										key={org.id}
										className="cursor-pointer gap-2"
										disabled={actionInFlight}
										onSelect={(event) => {
											event.preventDefault();
											void handleDropdownOrganizationSelect(org.id);
										}}
									>
										<Avatar className="size-4">
											<AvatarImage
												src={org.logo ?? undefined}
												alt={
													org.name ??
													t({
														id: "web.agentsHeader.organizationFallback",
														message: "Organization",
													})
												}
											/>
											<AvatarFallback className="text-[8px]">
												{org.name?.charAt(0) ?? "O"}
											</AvatarFallback>
										</Avatar>
										<span className="flex-1 truncate">{org.name}</span>
										{org.id === activeOrganizationId && (
											<Check className="size-4 text-primary" />
										)}
									</DropdownMenuItem>
								))}
							</DropdownMenuSubContent>
						</DropdownMenuSub>
						<DropdownMenuSeparator />
					</>
				)}
				<DropdownMenuItem
					className="cursor-pointer gap-2"
					disabled={actionInFlight}
					onSelect={(event) => {
						event.preventDefault();
						void handleDropdownSignOut();
					}}
				>
					<LogOut className="size-4" />
					<span>
						<Trans id="web.agentsHeader.logOut">Log out</Trans>
					</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	return (
		<header className="sticky top-0 z-40 w-full border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div className="mx-auto flex h-12 w-full items-center justify-between px-4">
				<Link
					href="/agents"
					aria-label={t({
						id: "web.agentsHeader.homeLink",
						message: "Go to home",
					})}
				>
					<svg
						width="282"
						height="46"
						viewBox="0 0 282 46"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
						className="h-4 w-auto text-foreground"
						aria-label="Choros"
					>
						<title>Choros</title>
						<text
							x="141"
							y="34"
							textAnchor="middle"
							fontFamily="-apple-system, 'SF Pro Display', system-ui, sans-serif"
							fontWeight="700"
							fontSize="38"
							letterSpacing="6"
							fill="currentColor"
						>
							CHOROS
						</text>
					</svg>
				</Link>

				<nav className="hidden items-center gap-1 sm:flex">
					{navItems.map((item) => {
						const isActive =
							item.href === "/agents"
								? pathname === "/agents" || pathname.startsWith("/agents/")
								: pathname.startsWith(item.href);

						return (
							<Link
								key={item.href}
								href={item.href}
								className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
									isActive
										? "bg-secondary text-foreground"
										: "text-muted-foreground hover:text-foreground"
								}`}
							>
								{i18n._(item.label)}
							</Link>
						);
					})}
				</nav>

				{orgMenu}
			</div>
		</header>
	);
}
