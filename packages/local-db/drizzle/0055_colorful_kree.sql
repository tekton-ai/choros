CREATE TABLE `profile_memberships` (
	`profile_id` text NOT NULL,
	`kind` text NOT NULL,
	`project_key` text,
	`host_id` text,
	`workspace_id` text,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "profile_memberships_nondefault" CHECK("profile_memberships"."profile_id" <> 'default'),
	CONSTRAINT "profile_memberships_shape" CHECK(("profile_memberships"."kind" = 'project' AND "profile_memberships"."project_key" IS NOT NULL AND length("profile_memberships"."project_key") > 0 AND "profile_memberships"."host_id" IS NULL AND "profile_memberships"."workspace_id" IS NULL) OR ("profile_memberships"."kind" = 'session' AND "profile_memberships"."project_key" IS NULL AND "profile_memberships"."host_id" IS NOT NULL AND length("profile_memberships"."host_id") > 0 AND "profile_memberships"."workspace_id" IS NOT NULL AND length("profile_memberships"."workspace_id") > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_memberships_project_unique` ON `profile_memberships` (`project_key`) WHERE "profile_memberships"."kind" = 'project';--> statement-breakpoint
CREATE UNIQUE INDEX `profile_memberships_session_unique` ON `profile_memberships` (`host_id`,`workspace_id`) WHERE "profile_memberships"."kind" = 'session';--> statement-breakpoint
CREATE INDEX `profile_memberships_profile_idx` ON `profile_memberships` (`profile_id`);--> statement-breakpoint
CREATE TABLE `profile_registry_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`selected_profile_id` text NOT NULL,
	FOREIGN KEY (`selected_profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "profile_registry_state_singleton" CHECK("profile_registry_state"."id" = 1),
	CONSTRAINT "profile_registry_state_revision_valid" CHECK("profile_registry_state"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE `profile_workspace_visits` (
	`profile_id` text NOT NULL,
	`host_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`visited_at` integer NOT NULL,
	PRIMARY KEY(`profile_id`, `host_id`, `workspace_id`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "profile_workspace_visits_time_valid" CHECK("profile_workspace_visits"."visited_at" >= 0)
);
--> statement-breakpoint
CREATE INDEX `profile_workspace_visits_recent_idx` ON `profile_workspace_visits` (`profile_id`,`visited_at`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`sort_order` integer NOT NULL,
	`is_default` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "profiles_default_identity" CHECK(("profiles"."is_default" = 1 AND "profiles"."id" = 'default') OR ("profiles"."is_default" = 0 AND "profiles"."id" <> 'default')),
	CONSTRAINT "profiles_sort_order_valid" CHECK("profiles"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_name_key_unique` ON `profiles` (`name_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_default_unique` ON `profiles` (`is_default`) WHERE "profiles"."is_default" = 1;