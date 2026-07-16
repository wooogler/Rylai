ALTER TABLE `scenario_progress` ADD `protective_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `scenario_progress` ADD `neutral_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `scenario_progress` ADD `vulnerable_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `scenario_progress` ADD `protective_rate` real;--> statement-breakpoint
ALTER TABLE `scenario_progress` ADD `mastery_reached_at` integer;--> statement-breakpoint
ALTER TABLE `scenario_progress` ADD `comfort_exit_at` integer;--> statement-breakpoint
ALTER TABLE `scenario_progress` ADD `completed_at` integer;--> statement-breakpoint
ALTER TABLE `scenarios` ADD `mastery_target_rate` integer DEFAULT 80 NOT NULL;--> statement-breakpoint
ALTER TABLE `scenarios` ADD `mastery_min_responses` integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE `scenarios` ADD `min_exchanges_per_stage` integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE `scenarios` ADD `time_gap_label` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `scenarios` ADD `splash_markdown` text;--> statement-breakpoint
ALTER TABLE `users` ADD `welcome_markdown` text;