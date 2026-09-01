"use client";

import { i18n } from "@choros/i18n";
import { Alerter, alert } from "@choros/ui/atoms/Alert";
import { Avatar } from "@choros/ui/atoms/Avatar";
import { Button } from "@choros/ui/button";
import { MeshGradient } from "@choros/ui/mesh-gradient";
import { SidebarCard } from "@choros/ui/sidebar-card";
import { toast } from "@choros/ui/sonner";
import { ThemePreviewCard } from "@choros/ui/theme-preview-card";
import { Trans } from "@lingui/react/macro";

import { ComponentCard } from "../../../components/ComponentCard";
import { ShowcaseSection } from "../../../components/ShowcaseSection";

const REFERENCED_ONLY = [
	{
		path: "@choros/ui/form",
		note: "react-hook-form bindings (FormField, FormItem, FormMessage…)",
	},
	{
		path: "@choros/ui/chart",
		note: "Recharts container + tooltip themed via --chart-1…5 tokens",
	},
	{
		path: "@choros/ui/sidebar",
		note: "Full app sidebar system (SidebarProvider, SidebarMenu…)",
	},
];

export function ChorosSection() {
	return (
		<ShowcaseSection
			id="choros"
			index="01"
			title={i18n._({
				id: "web.design.chorosSection.chorosOriginals",
				message: "Choros originals",
			})}
			description={i18n._({
				id: "web.design.chorosSection.customComponentsBeyondTheShadcn",
				message: "Custom components beyond the shadcn set",
			})}
		>
			<Alerter />

			<ComponentCard
				title={i18n._({
					id: "web.design.chorosSection.meshGradient",
					message: "Mesh Gradient",
				})}
				importPath="@choros/ui/mesh-gradient"
				description={i18n._({
					id: "web.design.chorosSection.animatedWebglGradientStripeGradient",
					message: "Animated WebGL gradient (stripe-gradient)",
				})}
				bleed
			>
				<MeshGradient
					colors={["#0f172a", "#1e3a5f", "#0e7490", "#164e63"]}
					className="h-48 w-full"
				/>
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.chorosSection.themePreviewCard",
					message: "Theme Preview Card",
				})}
				importPath="@choros/ui/theme-preview-card"
			>
				<ThemePreviewCard
					name="Choros Dark"
					subtitle={i18n._({
						id: "web.design.chorosSection.themeSubtitle",
						message: "Default terminal theme",
					})}
					backgroundColor="#16161e"
					foregroundColor="#c0caf5"
					promptColor="#7aa2f7"
					infoColor="#e0af68"
					readyColor="#9ece6a"
					palette={[
						"#f7768e",
						"#9ece6a",
						"#e0af68",
						"#7aa2f7",
						"#bb9af7",
						"#7dcfff",
					]}
					className="w-full max-w-72"
				/>
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.chorosSection.sidebarCard",
					message: "Sidebar Card",
				})}
				importPath="@choros/ui/sidebar-card"
			>
				<SidebarCard
					badge="Beta"
					title={i18n._({
						id: "web.design.chorosSection.mobileApp",
						message: "Mobile app",
					})}
					description={i18n._({
						id: "web.design.chorosSection.monitorAgentsFromYourPhone",
						message: "Monitor agents from your phone.",
					})}
					actionLabel="Join TestFlight"
					onAction={() =>
						toast(
							i18n._({
								id: "web.design.chorosSection.toastOpeningTestflight",
								message: "Opening TestFlight…",
							}),
						)
					}
					onDismiss={() =>
						toast(
							i18n._({
								id: "web.design.chorosSection.toastDismissed",
								message: "Dismissed",
							}),
						)
					}
					className="w-full max-w-64"
				/>
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.chorosSection.alertImperative",
					message: "Alert (imperative)",
				})}
				importPath="@choros/ui/atoms/Alert"
				description={i18n._({
					id: "web.design.chorosSection.alertOpensAPromiseFriendly",
					message:
						"alert() opens a promise-friendly dialog via the mounted Alerter",
				})}
			>
				<Button
					variant="outline"
					onClick={() =>
						alert({
							title: i18n._({
								id: "web.design.chorosSection.alertTitle",
								message: "Discard changes?",
							}),
							description: i18n._({
								id: "web.design.chorosSection.alertDescription",
								message:
									"The worktree has uncommitted edits from the agent session.",
							}),
							checkbox: {
								label: i18n._({
									id: "web.design.chorosSection.alertCheckbox",
									message: "Don't ask me again",
								}),
							},
							actions: [
								{
									label: i18n._({
										id: "web.design.chorosSection.alertKeepWorking",
										message: "Keep working",
									}),
									variant: "ghost",
								},
								{
									label: i18n._({
										id: "web.design.chorosSection.alertDiscard",
										message: "Discard",
									}),
									variant: "destructive",
									onClick: ({ checkboxChecked }) => {
										toast(
											checkboxChecked
												? i18n._({
														id: "web.design.chorosSection.toastDiscardedNoAsk",
														message: "Discarded — won't ask again",
													})
												: i18n._({
														id: "web.design.chorosSection.toastDiscarded",
														message: "Discarded",
													}),
										);
									},
								},
							],
						})
					}
				>
					<Trans id="web.design.chorosSection.triggerAlert">
						Trigger alert()
					</Trans>
				</Button>
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.chorosSection.avatarAtom",
					message: "Avatar (atom)",
				})}
				importPath="@choros/ui/atoms/Avatar"
				description={i18n._({
					id: "web.design.chorosSection.initialsFallbackViaGetinitialsSizes",
					message: "Initials fallback via getInitials, sizes xs → xl",
				})}
			>
				<Avatar size="xs" fullName="Avi Peltz" />
				<Avatar size="sm" fullName="Avi Peltz" />
				<Avatar size="md" fullName="Avi Peltz" />
				<Avatar size="lg" fullName="Avi Peltz" />
				<Avatar size="xl" fullName="Avi Peltz" />
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.chorosSection.referencedNotDemoed",
					message: "Referenced, not demoed",
				})}
				importPath="@choros/ui/*"
				copyable={false}
				description={i18n._({
					id: "web.design.chorosSection.needAppLevelWiringForm",
					message: "Need app-level wiring (form state, chart data, app shell)",
				})}
				span
			>
				<div className="w-full space-y-2">
					{REFERENCED_ONLY.map((entry) => (
						<div
							key={entry.path}
							className="flex flex-col gap-0.5 rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
						>
							<code className="font-mono text-xs">{entry.path}</code>
							<span className="text-xs text-muted-foreground">
								{entry.note}
							</span>
						</div>
					))}
				</div>
			</ComponentCard>
		</ShowcaseSection>
	);
}
