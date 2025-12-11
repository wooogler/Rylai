CREATE TABLE `scenario_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scenario_id` integer NOT NULL,
	`first_visited_at` integer NOT NULL,
	`last_visited_at` integer NOT NULL,
	`visit_count` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scenario_progress_user_scenario_idx` ON `scenario_progress` (`user_id`,`scenario_id`);--> statement-breakpoint
CREATE TABLE `scenarios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`predator_name` text NOT NULL,
	`handle` text NOT NULL,
	`stage` integer DEFAULT 1 NOT NULL,
	`system_prompt` text NOT NULL,
	`preset_messages` text NOT NULL,
	`description` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scenarios_user_id_idx` ON `scenarios` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_feedbacks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scenario_id` integer NOT NULL,
	`message_id` text NOT NULL,
	`feedback_text` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_feedbacks_user_scenario_idx` ON `user_feedbacks` (`user_id`,`scenario_id`);--> statement-breakpoint
CREATE INDEX `user_feedbacks_message_id_idx` ON `user_feedbacks` (`message_id`);--> statement-breakpoint
CREATE TABLE `user_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scenario_id` integer NOT NULL,
	`message_id` text NOT NULL,
	`text` text NOT NULL,
	`sender` text NOT NULL,
	`timestamp` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_messages_user_scenario_idx` ON `user_messages` (`user_id`,`scenario_id`);--> statement-breakpoint
CREATE INDEX `user_messages_message_id_idx` ON `user_messages` (`message_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`user_type` text NOT NULL,
	`common_system_prompt` text,
	`feedback_persona` text,
	`feedback_instruction` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `username_user_type_idx` ON `users` (`username`,`user_type`);