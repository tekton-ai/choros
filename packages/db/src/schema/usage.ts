import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

export const usageEvents = pgTable(
	"usage_events",
	{
		id: uuid().primaryKey(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		event: text().notNull().$type<"desktop_opened">(),
		occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
		receivedAt: timestamp("received_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		appVersion: text("app_version").notNull(),
		platform: text().notNull(),
		schemaVersion: integer("schema_version").notNull(),
	},
	(table) => [
		check("usage_events_event_check", sql`${table.event} = 'desktop_opened'`),
		check("usage_events_schema_version_check", sql`${table.schemaVersion} = 1`),
		index("usage_events_user_occurred_at_idx").on(
			table.userId,
			table.occurredAt,
		),
		index("usage_events_occurred_at_idx").on(table.occurredAt),
	],
);

export type InsertUsageEvent = typeof usageEvents.$inferInsert;
export type SelectUsageEvent = typeof usageEvents.$inferSelect;
