CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"event" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"app_version" text NOT NULL,
	"platform" text NOT NULL,
	"schema_version" integer NOT NULL,
	CONSTRAINT "usage_events_event_check" CHECK ("usage_events"."event" = 'desktop_opened'),
	CONSTRAINT "usage_events_schema_version_check" CHECK ("usage_events"."schema_version" = 1)
);
--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_events_user_occurred_at_idx" ON "usage_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "usage_events_occurred_at_idx" ON "usage_events" USING btree ("occurred_at");