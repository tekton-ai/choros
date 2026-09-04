import { Button } from "@choros/ui/button";
import { CardFooter } from "@choros/ui/card";
import { Trans } from "@lingui/react/macro";

interface AgentCardActionsProps {
	isResetting: boolean;
	onReset: () => void;
}

export function AgentCardActions({
	isResetting,
	onReset,
}: AgentCardActionsProps) {
	return (
		<CardFooter className="mt-2 justify-end">
			<Button variant="outline" onClick={onReset} disabled={isResetting}>
				<Trans id="settings.agents.card.resetToDefaults">
					Reset to Defaults
				</Trans>
			</Button>
		</CardFooter>
	);
}
