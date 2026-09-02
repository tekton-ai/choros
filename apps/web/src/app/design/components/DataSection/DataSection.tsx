"use client";

import { i18n } from "@choros/i18n";
import { Avatar, AvatarFallback, AvatarImage } from "@choros/ui/avatar";
import { Badge } from "@choros/ui/badge";
import { Button } from "@choros/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@choros/ui/card";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
} from "@choros/ui/carousel";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemSeparator,
	ItemTitle,
} from "@choros/ui/item";
import { Label } from "@choros/ui/label";
import { Switch } from "@choros/ui/switch";
import {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@choros/ui/table";
import { Trans } from "@lingui/react/macro";
import { FolderGitIcon, MoreHorizontalIcon } from "lucide-react";

import { ComponentCard } from "../ComponentCard";
import { ShowcaseSection } from "../ShowcaseSection";

const SESSIONS = [
	{ workspace: "component-showcase", agent: "Claude", status: "Running" },
	{ workspace: "fix-auth-redirect", agent: "Codex", status: "Idle" },
	{ workspace: "bump-deps", agent: "Claude", status: "Done" },
];

export function DataSection() {
	return (
		<ShowcaseSection
			id="data"
			index="07"
			title={i18n._({
				id: "web.design.dataSection.dataDisplay",
				message: "Data display",
			})}
			description={i18n._({
				id: "web.design.dataSection.badgesAvatarsCardsTablesAnd",
				message: "Badges, avatars, cards, tables, and lists",
			})}
		>
			<ComponentCard
				title={i18n._({ id: "web.design.dataSection.badge", message: "Badge" })}
				importPath="@choros/ui/badge"
				description={i18n._({
					id: "web.design.dataSection.includesTheChorosSpecificBox",
					message: "Includes the Choros-specific box variant",
				})}
			>
				<Badge>
					<Trans id="web.design.dataSection.default">Default</Trans>
				</Badge>
				<Badge variant="secondary">
					<Trans id="web.design.dataSection.secondary">Secondary</Trans>
				</Badge>
				<Badge variant="outline">
					<Trans id="web.design.dataSection.outline">Outline</Trans>
				</Badge>
				<Badge variant="destructive">
					<Trans id="web.design.dataSection.destructive">Destructive</Trans>
				</Badge>
				<Badge variant="box">
					<Trans id="web.design.dataSection.box">Box</Trans>
				</Badge>
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.dataSection.avatar",
					message: "Avatar",
				})}
				importPath="@choros/ui/avatar"
			>
				<Avatar>
					<AvatarImage
						src="https://github.com/choros-sh.png"
						alt={i18n._({
							id: "web.design.dataSection.choros",
							message: "Choros",
						})}
					/>
					<AvatarFallback>
						<Trans id="web.design.dataSection.ss">SS</Trans>
					</AvatarFallback>
				</Avatar>
				<Avatar>
					<AvatarFallback>
						<Trans id="web.design.dataSection.ap">AP</Trans>
					</AvatarFallback>
				</Avatar>
				<div className="flex -space-x-2">
					{["A", "B", "C"].map((letter) => (
						<Avatar key={letter} className="ring-2 ring-background">
							<AvatarFallback>{letter}</AvatarFallback>
						</Avatar>
					))}
				</div>
			</ComponentCard>

			<ComponentCard
				title={i18n._({ id: "web.design.dataSection.card", message: "Card" })}
				importPath="@choros/ui/card"
			>
				<Card className="w-full max-w-72">
					<CardHeader>
						<CardTitle>
							<Trans id="web.design.dataSection.notifications">
								Notifications
							</Trans>
						</CardTitle>
						<CardDescription>
							<Trans id="web.design.dataSection.chooseWhenChorosPingsYou">
								Choose when Choros pings you.
							</Trans>
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="flex items-center justify-between">
							<Label htmlFor="dsg-card-done">
								<Trans id="web.design.dataSection.agentFinished">
									Agent finished
								</Trans>
							</Label>
							<Switch id="dsg-card-done" defaultChecked />
						</div>
						<div className="flex items-center justify-between">
							<Label htmlFor="dsg-card-fail">
								<Trans id="web.design.dataSection.ciFailed">CI failed</Trans>
							</Label>
							<Switch id="dsg-card-fail" />
						</div>
					</CardContent>
					<CardFooter>
						<Button size="sm" className="w-full">
							<Trans id="web.design.dataSection.savePreferences">
								Save preferences
							</Trans>
						</Button>
					</CardFooter>
				</Card>
			</ComponentCard>

			<ComponentCard
				title={i18n._({ id: "web.design.dataSection.item", message: "Item" })}
				importPath="@choros/ui/item"
			>
				<ItemGroup className="w-full max-w-80">
					<Item>
						<ItemMedia variant="icon">
							<FolderGitIcon />
						</ItemMedia>
						<ItemContent>
							<ItemTitle>
								<Trans id="web.design.dataSection.componentShowcase">
									component-showcase
								</Trans>
							</ItemTitle>
							<ItemDescription>
								<Trans id="web.design.dataSection.2Agents14FilesChanged">
									2 agents · 14 files changed
								</Trans>
							</ItemDescription>
						</ItemContent>
						<ItemActions>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={i18n._({
									id: "web.design.dataSection.more",
									message: "More",
								})}
							>
								<MoreHorizontalIcon />
							</Button>
						</ItemActions>
					</Item>
					<ItemSeparator />
					<Item>
						<ItemMedia variant="icon">
							<FolderGitIcon />
						</ItemMedia>
						<ItemContent>
							<ItemTitle>
								<Trans id="web.design.dataSection.fixAuthRedirect">
									fix-auth-redirect
								</Trans>
							</ItemTitle>
							<ItemDescription>
								<Trans id="web.design.dataSection.idleBranchPushed">
									Idle · branch pushed
								</Trans>
							</ItemDescription>
						</ItemContent>
					</Item>
				</ItemGroup>
			</ComponentCard>

			<ComponentCard
				title={i18n._({ id: "web.design.dataSection.table", message: "Table" })}
				importPath="@choros/ui/table"
				span
				bleed
			>
				<Table>
					<TableCaption>
						<Trans id="web.design.dataSection.activeAgentSessions">
							Active agent sessions.
						</Trans>
					</TableCaption>
					<TableHeader>
						<TableRow>
							<TableHead>
								<Trans id="web.design.dataSection.workspace">Workspace</Trans>
							</TableHead>
							<TableHead>
								<Trans id="web.design.dataSection.agent">Agent</Trans>
							</TableHead>
							<TableHead className="text-right">
								<Trans id="web.design.dataSection.status">Status</Trans>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{SESSIONS.map((session) => (
							<TableRow key={session.workspace}>
								<TableCell className="font-mono text-xs">
									{session.workspace}
								</TableCell>
								<TableCell>{session.agent}</TableCell>
								<TableCell className="text-right">
									<Badge
										variant={
											session.status === "Running" ? "default" : "secondary"
										}
									>
										{session.status}
									</Badge>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.dataSection.carousel",
					message: "Carousel",
				})}
				importPath="@choros/ui/carousel"
				span
			>
				<Carousel className="w-full max-w-56">
					<CarouselContent>
						{[1, 2, 3, 4, 5].map((slide) => (
							<CarouselItem key={slide}>
								<div className="flex aspect-square items-center justify-center rounded-lg border bg-muted/40 font-mono text-3xl text-muted-foreground">
									{slide}
								</div>
							</CarouselItem>
						))}
					</CarouselContent>
					<CarouselPrevious />
					<CarouselNext />
				</Carousel>
			</ComponentCard>
		</ShowcaseSection>
	);
}
