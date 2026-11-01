CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`error` text,
	`original_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`path` text NOT NULL,
	`thumbnail_path` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assets_project_id_idx` ON `assets` (`project_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`doc` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
