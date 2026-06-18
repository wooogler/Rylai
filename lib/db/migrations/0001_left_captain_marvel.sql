CREATE TABLE `preview_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scenario_id` integer NOT NULL,
	`draft_text` text NOT NULL,
	`feedback_text` text NOT NULL,
	`classification` text,
	`stage` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `preview_events_user_scenario_idx` ON `preview_events` (`user_id`,`scenario_id`);