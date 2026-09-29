CREATE TABLE `chat_managed_inputs` (
	`input_id` text PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`provider_request_id` text NOT NULL,
	`kind` text NOT NULL,
	`question` text NOT NULL,
	`options_json` text,
	`status` text NOT NULL,
	`answer` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chat_managed_inputs_operation_id_idx` ON `chat_managed_inputs` (`operation_id`);--> statement-breakpoint
CREATE TABLE `chat_managed_operations` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`parameters_hash` text NOT NULL,
	`session_id` text NOT NULL,
	`scope_id` text NOT NULL,
	`harness` text NOT NULL,
	`provider_session_id` text,
	`provider_turn_id` text,
	`state` text NOT NULL,
	`outcome` text,
	`quiescent` integer DEFAULT false NOT NULL,
	`prompt_state` text DEFAULT 'pending' NOT NULL,
	`report_json` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_managed_operations_session_id_unique` ON `chat_managed_operations` (`session_id`);--> statement-breakpoint
CREATE INDEX `chat_managed_operations_session_id_idx` ON `chat_managed_operations` (`session_id`);--> statement-breakpoint
CREATE INDEX `chat_managed_operations_scope_id_idx` ON `chat_managed_operations` (`scope_id`);