-- Deduplicate any existing rows that share (user_id, scenario_id, message_id) before adding
-- the unique index (keep the earliest by rowid). Old timestamped-preset duplicates have
-- distinct message_ids and aren't touched here — a scenario Restart re-seeds those cleanly.
DELETE FROM `user_messages` WHERE `rowid` NOT IN (
  SELECT MIN(`rowid`) FROM `user_messages` GROUP BY `user_id`, `scenario_id`, `message_id`
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_messages_user_scenario_message_idx` ON `user_messages` (`user_id`,`scenario_id`,`message_id`);
