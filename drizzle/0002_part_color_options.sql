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
CREATE INDEX `part_color_options_color_idx` ON `part_color_options` (`color_id`);
