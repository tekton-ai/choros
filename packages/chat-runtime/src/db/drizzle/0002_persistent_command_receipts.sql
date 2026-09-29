CREATE TABLE `chat_command_receipts` (
	`command_key` text PRIMARY KEY NOT NULL,
	`parameters_hash` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` integer NOT NULL
);
