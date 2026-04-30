ALTER TABLE `download_jobs` ADD `progress_stage` text;--> statement-breakpoint
ALTER TABLE `download_jobs` ADD `progress_current` integer;--> statement-breakpoint
ALTER TABLE `download_jobs` ADD `progress_total` integer;--> statement-breakpoint
ALTER TABLE `download_jobs` ADD `progress_detail` text;