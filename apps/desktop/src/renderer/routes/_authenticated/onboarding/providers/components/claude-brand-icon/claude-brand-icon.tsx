import { cn } from "@choros/ui/utils";
import { ClaudeLogo } from "../claude-logo";

interface ClaudeBrandIconProps {
	className?: string;
	iconClassName?: string;
}

export function ClaudeBrandIcon({
	className,
	iconClassName,
}: ClaudeBrandIconProps) {
	return (
		<div
			className={cn("flex items-center justify-center bg-[#D97757]", className)}
		>
			<ClaudeLogo className={cn("text-white", iconClassName)} />
		</div>
	);
}
