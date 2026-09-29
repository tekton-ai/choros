CREATE TABLE `automation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`automation_id` text NOT NULL,
	`definition_revision` integer NOT NULL,
	`source` text NOT NULL,
	`planned_at` integer,
	`occurrence_key` text,
	`status` text NOT NULL,
	`reason` text,
	`execution_id` text,
	`retry_of` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`automation_id`) REFERENCES `automations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `automation_runs_occurrence_uq` ON `automation_runs` (`automation_id`,`occurrence_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `automation_runs_execution_uq` ON `automation_runs` (`execution_id`);--> statement-breakpoint
CREATE INDEX `automation_runs_history_idx` ON `automation_runs` (`automation_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `automation_runs_status_idx` ON `automation_runs` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `automation_versions` (
	`automation_id` text NOT NULL,
	`revision` integer NOT NULL,
	`definition` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`automation_id`, `revision`),
	FOREIGN KEY (`automation_id`) REFERENCES `automations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `automations` (
	`id` text PRIMARY KEY NOT NULL,
	`current_revision` integer NOT NULL,
	`version` integer NOT NULL,
	`state` text NOT NULL,
	`next_due_at` integer,
	`schedule_cursor` integer,
	`used_rounds` integer DEFAULT 0 NOT NULL,
	`resume_at` integer,
	`last_finished_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `automations_state_due_idx` ON `automations` (`state`,`next_due_at`);--> statement-breakpoint
CREATE INDEX `automations_updated_idx` ON `automations` (`updated_at`,`id`);--> statement-breakpoint
CREATE TABLE `execution_inputs` (
	`id` text PRIMARY KEY NOT NULL,
	`execution_id` text NOT NULL,
	`kind` text NOT NULL,
	`question` text NOT NULL,
	`options` text,
	`status` text NOT NULL,
	`version` integer NOT NULL,
	`answer` text,
	`delivery_state` text,
	`created_at` integer NOT NULL,
	`answered_at` integer,
	FOREIGN KEY (`execution_id`) REFERENCES `execution_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `execution_inputs_pending_idx` ON `execution_inputs` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `execution_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`execution_id` text NOT NULL,
	`kind` text NOT NULL,
	`state` text NOT NULL,
	`parameter_digest` text NOT NULL,
	`receipt` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`execution_id`) REFERENCES `execution_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `execution_operations_kind_uq` ON `execution_operations` (`execution_id`,`kind`);--> statement-breakpoint
CREATE INDEX `execution_operations_state_idx` ON `execution_operations` (`state`,`updated_at`);--> statement-breakpoint
CREATE TABLE `execution_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`automation_id` text NOT NULL,
	`definition_revision` integer NOT NULL,
	`status` text NOT NULL,
	`stage` text NOT NULL,
	`workspace_id` text,
	`automation_occupancy` text,
	`workspace_occupancy` text,
	`chat_session_id` text,
	`provider_session_id` text,
	`report` text,
	`cancel_requested_at` integer,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`run_id`) REFERENCES `automation_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`automation_id`) REFERENCES `automations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `execution_runs_run_uq` ON `execution_runs` (`run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `execution_runs_automation_occupancy_uq` ON `execution_runs` (`automation_occupancy`);--> statement-breakpoint
CREATE UNIQUE INDEX `execution_runs_workspace_occupancy_uq` ON `execution_runs` (`workspace_occupancy`);--> statement-breakpoint
CREATE INDEX `execution_runs_status_idx` ON `execution_runs` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `work_command_receipts` (
	`scope` text NOT NULL,
	`request_id` text NOT NULL,
	`parameter_digest` text NOT NULL,
	`confirmation_digest` text,
	`result` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `request_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_command_confirmation_uq` ON `work_command_receipts` (`confirmation_digest`);--> statement-breakpoint
CREATE TABLE `work_events` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`automation_id` text,
	`run_id` text,
	`type` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `work_events_automation_idx` ON `work_events` (`automation_id`,`seq`);--> statement-breakpoint
CREATE INDEX `work_events_run_idx` ON `work_events` (`run_id`,`seq`);