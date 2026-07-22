CREATE TABLE `archived_feedbacks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scenario_id` integer NOT NULL,
	`archived_at` integer NOT NULL,
	`message_id` text NOT NULL,
	`feedback_text` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `archived_feedbacks_user_scenario_idx` ON `archived_feedbacks` (`user_id`,`scenario_id`);--> statement-breakpoint
CREATE TABLE `archived_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scenario_id` integer NOT NULL,
	`archived_at` integer NOT NULL,
	`message_id` text NOT NULL,
	`text` text NOT NULL,
	`sender` text NOT NULL,
	`stage` integer,
	`classification` text,
	`response_type` text,
	`tactic_recognized` integer,
	`protective_strategy` integer,
	`rationale` text,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `archived_messages_user_scenario_idx` ON `archived_messages` (`user_id`,`scenario_id`);