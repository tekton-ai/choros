import type { ReactNode } from "react";

export function DetailRow({
	label,
	value,
}: {
	label: ReactNode;
	value: ReactNode;
}) {
	return (
		<div className="grid gap-1 border-b border-border/60 py-2 last:border-0 sm:grid-cols-[180px_1fr]">
			<dt className="text-sm text-muted-foreground">{label}</dt>
			<dd className="min-w-0 break-words text-sm">{value}</dd>
		</div>
	);
}
