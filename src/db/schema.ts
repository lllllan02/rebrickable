import { relations } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

import { mocAttachmentTypes } from "@/lib/moc-attachment-kind";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
};

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  ...timestamps,
});

export const sets = sqliteTable(
  "sets",
  {
    setNum: text("set_num").primaryKey(),
    name: text("name").notNull(),
    year: integer("year"),
    themeId: integer("theme_id"),
    themeName: text("theme_name"),
    numParts: integer("num_parts"),
    imageUrl: text("image_url"),
    rebrickableUrl: text("rebrickable_url"),
    ownedQuantity: integer("owned_quantity").notNull().default(0),
    notes: text("notes"),
    rawJson: text("raw_json"),
    downloadedAt: integer("downloaded_at", { mode: "timestamp" }),
    ...timestamps,
  },
  (table) => [index("sets_name_idx").on(table.name)],
);

export const parts = sqliteTable(
  "parts",
  {
    partNum: text("part_num").primaryKey(),
    name: text("name").notNull(),
    categoryId: integer("category_id"),
    categoryName: text("category_name"),
    imageUrl: text("image_url"),
    rebrickableUrl: text("rebrickable_url"),
    rawJson: text("raw_json"),
    downloadedAt: integer("downloaded_at", { mode: "timestamp" }),
    ...timestamps,
  },
  (table) => [index("parts_name_idx").on(table.name)],
);

export const partCategories = sqliteTable("part_categories", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  rawJson: text("raw_json"),
  downloadedAt: integer("downloaded_at", { mode: "timestamp" }),
  ...timestamps,
});

/** Rebrickable `part_relationships.csv`（印刷电路板上的零件组合关系等）。 */
export const partRelationships = sqliteTable(
  "part_relationships",
  {
    relType: text("rel_type").notNull(),
    childPartNum: text("child_part_num").notNull(),
    parentPartNum: text("parent_part_num").notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      columns: [table.relType, table.childPartNum, table.parentPartNum],
    }),
    index("part_relationships_parent_idx").on(table.parentPartNum),
  ],
);

export const colors = sqliteTable("colors", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  rgb: text("rgb"),
  isTransparent: integer("is_transparent", { mode: "boolean" })
    .notNull()
    .default(false),
  ...timestamps,
});

export const partColorOptions = sqliteTable(
  "part_color_options",
  {
    partNum: text("part_num")
      .notNull()
      .references(() => parts.partNum),
    colorId: integer("color_id")
      .notNull()
      .references(() => colors.id),
    imageUrl: text("image_url"),
    elementIds: text("element_ids"),
    numSets: integer("num_sets"),
    rawJson: text("raw_json"),
    downloadedAt: integer("downloaded_at", { mode: "timestamp" }),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      columns: [table.partNum, table.colorId],
    }),
    index("part_color_options_color_idx").on(table.colorId),
  ],
);

export const setParts = sqliteTable(
  "set_parts",
  {
    setNum: text("set_num")
      .notNull()
      .references(() => sets.setNum, { onDelete: "cascade" }),
    partNum: text("part_num")
      .notNull()
      .references(() => parts.partNum),
    colorId: integer("color_id")
      .notNull()
      .references(() => colors.id),
    elementId: text("element_id"),
    imageUrl: text("image_url"),
    quantity: integer("quantity").notNull(),
    isSpare: integer("is_spare", { mode: "boolean" }).notNull().default(false),
    rawJson: text("raw_json"),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      columns: [table.setNum, table.partNum, table.colorId, table.isSpare],
    }),
  ],
);

export const mocs = sqliteTable(
  "mocs",
  {
    mocId: integer("moc_id").primaryKey(),
    name: text("name").notNull(),
    designerName: text("designer_name"),
    sourceSetNum: text("source_set_num"),
    numParts: integer("num_parts"),
    imageUrl: text("image_url"),
    rebrickableUrl: text("rebrickable_url"),
    buildStatus: text("build_status").notNull().default("planned"),
    notes: text("notes"),
    rawJson: text("raw_json"),
    downloadedAt: integer("downloaded_at", { mode: "timestamp" }),
    ...timestamps,
  },
  (table) => [
    index("mocs_name_idx").on(table.name),
    index("mocs_source_set_idx").on(table.sourceSetNum),
  ],
);

export const mocParts = sqliteTable(
  "moc_parts",
  {
    mocId: integer("moc_id")
      .notNull()
      .references(() => mocs.mocId, { onDelete: "cascade" }),
    partNum: text("part_num")
      .notNull()
      .references(() => parts.partNum),
    colorId: integer("color_id")
      .notNull()
      .references(() => colors.id),
    quantity: integer("quantity").notNull(),
    isSpare: integer("is_spare", { mode: "boolean" }).notNull().default(false),
    rawJson: text("raw_json"),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      columns: [table.mocId, table.partNum, table.colorId, table.isSpare],
    }),
  ],
);

export const mocAttachments = sqliteTable(
  "moc_attachments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mocId: integer("moc_id")
      .notNull()
      .references(() => mocs.mocId, { onDelete: "cascade" }),
    attachmentType: text("attachment_type", {
      enum: mocAttachmentTypes,
    }).notNull(),
    originalFileName: text("original_file_name").notNull(),
    publicPath: text("public_path").notNull(),
    mimeType: text("mime_type"),
    fileSize: integer("file_size").notNull(),
    ...timestamps,
  },
  (table) => [index("moc_attachments_moc_idx").on(table.mocId)],
);

export const downloadJobs = sqliteTable(
  "download_jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceType: text("source_type", { enum: ["set", "moc", "catalog"] }).notNull(),
    sourceId: text("source_id").notNull(),
    status: text("status", {
      enum: ["pending", "running", "completed", "failed", "cancelled"],
    })
      .notNull()
      .default("pending"),
    message: text("message"),
    progressStage: text("progress_stage"),
    progressCurrent: integer("progress_current"),
    progressTotal: integer("progress_total"),
    progressDetail: text("progress_detail"),
    ...timestamps,
  },
  (table) => [index("download_jobs_source_idx").on(table.sourceType, table.sourceId)],
);

export const setRelations = relations(sets, ({ many }) => ({
  inventory: many(setParts),
}));

export const partRelations = relations(parts, ({ many }) => ({
  setInventories: many(setParts),
  mocInventories: many(mocParts),
  colorOptions: many(partColorOptions),
}));

export const partCategoryRelations = relations(partCategories, ({ many }) => ({
  parts: many(parts),
}));

export const colorRelations = relations(colors, ({ many }) => ({
  setParts: many(setParts),
  mocParts: many(mocParts),
  partOptions: many(partColorOptions),
}));

export const partColorOptionRelations = relations(partColorOptions, ({ one }) => ({
  part: one(parts, {
    fields: [partColorOptions.partNum],
    references: [parts.partNum],
  }),
  color: one(colors, {
    fields: [partColorOptions.colorId],
    references: [colors.id],
  }),
}));

export const setPartRelations = relations(setParts, ({ one }) => ({
  set: one(sets, {
    fields: [setParts.setNum],
    references: [sets.setNum],
  }),
  part: one(parts, {
    fields: [setParts.partNum],
    references: [parts.partNum],
  }),
  color: one(colors, {
    fields: [setParts.colorId],
    references: [colors.id],
  }),
}));

export const mocRelations = relations(mocs, ({ many }) => ({
  inventory: many(mocParts),
  attachments: many(mocAttachments),
}));

export const mocAttachmentRelations = relations(mocAttachments, ({ one }) => ({
  moc: one(mocs, {
    fields: [mocAttachments.mocId],
    references: [mocs.mocId],
  }),
}));

export const mocPartRelations = relations(mocParts, ({ one }) => ({
  moc: one(mocs, {
    fields: [mocParts.mocId],
    references: [mocs.mocId],
  }),
  part: one(parts, {
    fields: [mocParts.partNum],
    references: [parts.partNum],
  }),
  color: one(colors, {
    fields: [mocParts.colorId],
    references: [colors.id],
  }),
}));
