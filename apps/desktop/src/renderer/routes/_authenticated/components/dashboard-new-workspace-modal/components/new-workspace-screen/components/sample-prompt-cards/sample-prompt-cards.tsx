import { useLingui } from "@lingui/react/macro";
import {
	BookOpenIcon,
	BugIcon,
	FlaskConicalIcon,
	ScrollTextIcon,
	WrenchIcon,
} from "lucide-react";

import { DismissSuggestionsButton } from "../dismiss-suggestions-button";
import type { SamplePrompt } from "../sample-prompts/constants";
import { AgentLogoCluster } from "./components/agent-logo-cluster";

const CARD_ICONS: Record<string, typeof WrenchIcon> = {
	"set-up-project": WrenchIcon,
	"explain-repo": BookOpenIcon,
	"fix-small-bug": BugIcon,
	"add-missing-tests": FlaskConicalIcon,
	"improve-agent-docs": ScrollTextIcon,
};

interface SamplePromptCardsProps {
	prompts: SamplePrompt[];
	onSelect: (prompt: string) => void;
	onDismiss: () => void;
	canDismiss: boolean;
}

export function SamplePromptCards({
	prompts,
	onSelect,
	onDismiss,
	canDismiss,
}: SamplePromptCardsProps) {
	const { t } = useLingui();
	return (
		<div className="group relative px-1 pb-2">
			{canDismiss && <DismissSuggestionsButton onDismiss={onDismiss} />}
			<div className="grid grid-cols-2 gap-2">
				{prompts.map((sample) => {
					const Icon = CARD_ICONS[sample.id] ?? WrenchIcon;
					return (
						<button
							key={sample.id}
							type="button"
							className="flex cursor-pointer flex-col items-start gap-1.5 rounded-xl border-[0.5px] border-border bg-foreground/[0.02] p-3 text-left transition-colors hover:border-foreground/20 hover:bg-foreground/[0.05]"
							onClick={() => {
								onSelect(sample.prompt);
							}}
						>
							{sample.id === "improve-agent-docs" ? (
								<AgentLogoCluster />
							) : (
								<Icon className="size-3.5 shrink-0 text-muted-foreground" />
							)}
							<span className="text-sm font-medium text-foreground/90">
								{t(sample.label)}
							</span>
							<span className="text-xs text-muted-foreground">
								{t(sample.description)}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}
