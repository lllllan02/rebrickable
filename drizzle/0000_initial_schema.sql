CREATE TABLE `colors` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`rgb` text,
	`is_transparent` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `download_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`message` text,
	`progress_stage` text,
	`progress_current` integer,
	`progress_total` integer,
	`progress_detail` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `download_jobs_source_idx` ON `download_jobs` (`source_type`,`source_id`);--> statement-breakpoint
CREATE TABLE `moc_parts` (
	`moc_id` integer NOT NULL,
	`part_num` text NOT NULL,
	`color_id` integer NOT NULL,
	`quantity` integer NOT NULL,
	`is_spare` integer DEFAULT false NOT NULL,
	`raw_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`moc_id`, `part_num`, `color_id`, `is_spare`),
	FOREIGN KEY (`moc_id`) REFERENCES `mocs`(`moc_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`part_num`) REFERENCES `parts`(`part_num`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`color_id`) REFERENCES `colors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `mocs` (
	`moc_id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`designer_name` text,
	`source_set_num` text,
	`num_parts` integer,
	`image_url` text,
	`rebrickable_url` text,
	`build_status` text DEFAULT 'planned' NOT NULL,
	`notes` text,
	`raw_json` text,
	`downloaded_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mocs_name_idx` ON `mocs` (`name`);--> statement-breakpoint
CREATE INDEX `mocs_source_set_idx` ON `mocs` (`source_set_num`);--> statement-breakpoint
CREATE TABLE `part_categories` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`raw_json` text,
	`downloaded_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `part_color_options` (
	`part_num` text NOT NULL,
	`color_id` integer NOT NULL,
	`image_url` text,
	`element_ids` text,
	`num_sets` integer,
	`raw_json` text,
	`downloaded_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`part_num`, `color_id`),
	FOREIGN KEY (`part_num`) REFERENCES `parts`(`part_num`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`color_id`) REFERENCES `colors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `part_color_options_color_idx` ON `part_color_options` (`color_id`);--> statement-breakpoint
CREATE TABLE `parts` (
	`part_num` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category_id` integer,
	`category_name` text,
	`image_url` text,
	`rebrickable_url` text,
	`raw_json` text,
	`downloaded_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `parts_name_idx` ON `parts` (`name`);--> statement-breakpoint
CREATE TABLE `set_parts` (
	`set_num` text NOT NULL,
	`part_num` text NOT NULL,
	`color_id` integer NOT NULL,
	`element_id` text,
	`image_url` text,
	`quantity` integer NOT NULL,
	`is_spare` integer DEFAULT false NOT NULL,
	`raw_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`set_num`, `part_num`, `color_id`, `is_spare`),
	FOREIGN KEY (`set_num`) REFERENCES `sets`(`set_num`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`part_num`) REFERENCES `parts`(`part_num`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`color_id`) REFERENCES `colors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sets` (
	`set_num` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`year` integer,
	`theme_id` integer,
	`theme_name` text,
	`num_parts` integer,
	`image_url` text,
	`rebrickable_url` text,
	`owned_quantity` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`raw_json` text,
	`downloaded_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sets_name_idx` ON `sets` (`name`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
