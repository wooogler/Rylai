CREATE TABLE `access_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`educator_id` text NOT NULL,
	`participant_label` text DEFAULT '' NOT NULL,
	`used_by_user_id` text,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`educator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`used_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_codes_code_idx` ON `access_codes` (`code`);--> statement-breakpoint
CREATE INDEX `access_codes_educator_idx` ON `access_codes` (`educator_id`);--> statement-breakpoint
ALTER TABLE `scenarios` ADD `assessment_mode` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `scenarios` ADD `max_messages` integer DEFAULT 0 NOT NULL;