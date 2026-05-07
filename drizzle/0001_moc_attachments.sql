CREATE TABLE `moc_attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`moc_id` integer NOT NULL,
	`attachment_type` text NOT NULL,
	`original_file_name` text NOT NULL,
	`public_path` text NOT NULL,
	`mime_type` text,
	`file_size` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`moc_id`) REFERENCES `mocs`(`moc_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `moc_attachments_moc_idx` ON `moc_attachments` (`moc_id`);
