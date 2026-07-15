ALTER TABLE `scenarios` ADD `max_stage` integer DEFAULT 6 NOT NULL;--> statement-breakpoint
-- Stage 0 ("Free Interaction") is not supported by the VT server (stages 1–6 only).
-- Promote any legacy stage-0 scenarios to stage 1.
UPDATE `scenarios` SET `stage` = 1 WHERE `stage` = 0;