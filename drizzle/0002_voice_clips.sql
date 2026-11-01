CREATE TABLE `voice_clips` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`voice_id` text NOT NULL,
	`path` text NOT NULL,
	`duration` real NOT NULL,
	`characters` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `voice_clips_created_at_idx` ON `voice_clips` (`created_at`);