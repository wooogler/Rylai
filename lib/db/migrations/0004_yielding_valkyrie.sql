ALTER TABLE `scenarios` ADD `mastery_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `scenarios` ADD `mastery_threshold` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `scenarios` ADD `persist_messages` integer DEFAULT false NOT NULL;