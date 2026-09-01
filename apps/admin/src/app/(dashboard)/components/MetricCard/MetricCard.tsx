"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@choros/ui/card";
import { Skeleton } from "@choros/ui/skeleton";
import { cn } from "@choros/ui/utils";
import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";

interface MetricCardProps {
	title: string;
	description?: string;
	value: number | null | undefined;
	isLoading?: boolean;
	error?: { message: string } | null;
	formatter?: (value: number) => string;
	headerAction?: ReactNode;
	className?: string;
}

export function MetricCard({
	title,
	description,
	value,
	isLoading,
	error,
	formatter = (v) => v.toLocaleString(),
	headerAction,
	className,
}: MetricCardProps) {
	return (
		<Card className={cn("flex flex-col", className)}>
			<CardHeader className="pb-2">
				<div className="flex items-center justify-between">
					<CardTitle className="text-sm font-medium">{title}</CardTitle>
					{headerAction}
				</div>
				{description && <CardDescription>{description}</CardDescription>}
			</CardHeader>
			<CardContent className="flex flex-1 items-center justify-center">
				{isLoading ? (
					<Skeleton className="h-9 w-24" />
				) : error ? (
					<p className="text-destructive text-sm">
						<Trans id="admin.metricCard.failedToLoad">Failed to load</Trans>
					</p>
				) : value !== null && value !== undefined ? (
					<p className="text-3xl font-bold">{formatter(value)}</p>
				) : (
					<p className="text-muted-foreground text-sm">
						<Trans id="admin.metricCard.noData">No data</Trans>
					</p>
				)}
			</CardContent>
		</Card>
	);
}
