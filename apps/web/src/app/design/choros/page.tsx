import type { Metadata } from "next";
import { i18n } from "@/lib/i18n-server";

import { DesignPageHeader } from "../components/DesignPageHeader";
import { ShowcaseNav, type ShowcaseNavItem } from "../components/ShowcaseNav";
import { AiAgentSection } from "./components/AiAgentSection";
import { AiChatSection } from "./components/AiChatSection";
import { AiContentSection } from "./components/AiContentSection";
import { AiStatusSection } from "./components/AiStatusSection";
import { ChorosSection } from "./components/ChorosSection";
import { SharedComponentsSection } from "./components/SharedComponentsSection";

export const metadata: Metadata = {
	title: "Design · Choros components",
	description:
		"Choros's custom components: originals, AI elements, shared app components",
};

const NAV_ITEMS: ShowcaseNavItem[] = [
	{
		id: "choros",
		index: "01",
		title: i18n._({
			id: "web.design.chorosNav.originals",
			message: "Originals",
		}),
	},
	{
		id: "ai-status",
		index: "02",
		title: i18n._({
			id: "web.design.chorosNav.aiStatus",
			message: "AI · Status",
		}),
	},
	{
		id: "ai-chat",
		index: "03",
		title: i18n._({
			id: "web.design.chorosNav.aiConversation",
			message: "AI · Conversation",
		}),
	},
	{
		id: "ai-agent",
		index: "04",
		title: i18n._({
			id: "web.design.chorosNav.aiAgentActivity",
			message: "AI · Agent activity",
		}),
	},
	{
		id: "ai-content",
		index: "05",
		title: i18n._({
			id: "web.design.chorosNav.aiContent",
			message: "AI · Content",
		}),
	},
	{
		id: "shared",
		index: "06",
		title: i18n._({
			id: "web.design.chorosNav.sharedAppComponents",
			message: "Shared app components",
		}),
	},
];

export default function DesignChorosPage() {
	return (
		<div className="min-h-screen bg-background">
			<DesignPageHeader
				active="choros"
				title={i18n._({
					id: "web.design.choros.title",
					message: "Choros Components",
				})}
				description={
					<>
						{i18n._({
							id: "web.design.choros.descriptionLead",
							message:
								"Everything we built on top of the primitives — Choros originals, the",
						})}{" "}
						<code className="font-mono text-foreground">ai-elements</code>{" "}
						{i18n._({
							id: "web.design.choros.descriptionTail",
							message:
								"suite for agent UIs, and shared app components. Click any import path to copy it.",
						})}
					</>
				}
			/>

			<div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-10 lg:grid-cols-[11rem_1fr]">
				<ShowcaseNav items={NAV_ITEMS} />
				<main className="min-w-0 space-y-16 pb-24">
					<ChorosSection />
					<AiStatusSection />
					<AiChatSection />
					<AiAgentSection />
					<AiContentSection />
					<SharedComponentsSection />
				</main>
			</div>
		</div>
	);
}
