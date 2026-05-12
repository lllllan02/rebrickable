import {
  index,
  integer,
  sqliteTable,
  text,
  primaryKey,
} from "drizzle-orm/sqlite-core";

export const colors = sqliteTable("colors", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  rgb: text("rgb").notNull(),
  isTrans: integer("is_trans", { mode: "boolean" }).notNull(),
  numParts: integer("num_parts"),
  numSets: integer("num_sets"),
  y1: integer("y1"),
  y2: integer("y2"),
});

export const partCategories = sqliteTable("part_categories", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
});

export const parts = sqliteTable(
  "parts",
  {
    partNum: text("part_num").primaryKey(),
    name: text("name").notNull(),
    partCatId: integer("part_cat_id").references(() => partCategories.id),
    partMaterial: text("part_material"),
  },
  (t) => [index("parts_name_idx").on(t.name), index("parts_cat_idx").on(t.partCatId)]
);

export const elements = sqliteTable(
  "elements",
  {
    elementId: text("element_id").primaryKey(),
    partNum: text("part_num")
      .notNull()
      .references(() => parts.partNum),
    colorId: integer("color_id")
      .notNull()
      .references(() => colors.id),
    designId: text("design_id"),
  },
  (t) => [index("elements_part_idx").on(t.partNum)]
);

/** Rebrickable themes.csv */
export const legoThemes = sqliteTable(
  "themes",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    parentId: integer("parent_id"),
  },
  (t) => [index("themes_parent_idx").on(t.parentId)]
);

/** Rebrickable sets.csv：含套装盒图 img_url（与 inventory 里的零件图不同） */
export const legoSets = sqliteTable(
  "sets",
  {
    setNum: text("set_num").primaryKey(),
    name: text("name").notNull(),
    year: integer("year"),
    themeId: integer("theme_id").references(() => legoThemes.id),
    numParts: integer("num_parts"),
    imgUrl: text("img_url"),
  },
  (t) => [index("sets_name_idx").on(t.name)]
);

export const inventories = sqliteTable(
  "inventories",
  {
    id: integer("id").primaryKey(),
    version: integer("version").notNull(),
    setNum: text("set_num").notNull(),
  },
  (t) => [index("inventories_set_num_idx").on(t.setNum)]
);

export const inventoryParts = sqliteTable(
  "inventory_parts",
  {
    inventoryId: integer("inventory_id")
      .notNull()
      .references(() => inventories.id),
    partNum: text("part_num")
      .notNull()
      .references(() => parts.partNum),
    colorId: integer("color_id")
      .notNull()
      .references(() => colors.id),
    quantity: integer("quantity").notNull(),
    isSpare: integer("is_spare", { mode: "boolean" }).notNull(),
    imgUrl: text("img_url"),
  },
  (t) => [
    primaryKey({ columns: [t.inventoryId, t.partNum, t.colorId, t.isSpare] }),
    index("ip_inventory_idx").on(t.inventoryId),
    index("ip_part_idx").on(t.partNum),
  ]
);

/** Rebrickable minifigs.csv：小人图档 URL，用于纯小人套装封面回退 */
export const minifigs = sqliteTable(
  "minifigs",
  {
    figNum: text("fig_num").primaryKey(),
    name: text("name").notNull(),
    numParts: integer("num_parts"),
    imgUrl: text("img_url"),
  },
  (t) => [index("minifigs_name_idx").on(t.name)]
);

/** Rebrickable inventory_minifigs.csv */
export const inventoryMinifigs = sqliteTable(
  "inventory_minifigs",
  {
    inventoryId: integer("inventory_id")
      .notNull()
      .references(() => inventories.id),
    figNum: text("fig_num")
      .notNull()
      .references(() => minifigs.figNum),
    quantity: integer("quantity").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.inventoryId, t.figNum] }),
    index("im_inv_idx").on(t.inventoryId),
    index("im_fig_idx").on(t.figNum),
  ]
);

export const partRelationships = sqliteTable(
  "part_relationships",
  {
    relType: text("rel_type").notNull(),
    childPartNum: text("child_part_num")
      .notNull()
      .references(() => parts.partNum),
    parentPartNum: text("parent_part_num")
      .notNull()
      .references(() => parts.partNum),
  },
  (t) => [
    primaryKey({
      columns: [t.relType, t.childPartNum, t.parentPartNum],
    }),
    index("pr_parent_idx").on(t.parentPartNum),
    index("pr_child_idx").on(t.childPartNum),
  ]
);

/** 本地 MOC / 官方套装编号 共用的已存零件表（JSON），主键为 (subject_kind, subject_id) */
export const buildSavedPartsSheets = sqliteTable(
  "build_saved_parts_sheets",
  {
    subjectKind: text("subject_kind").notNull(),
    subjectId: text("subject_id").notNull(),
    skippedHeader: integer("skipped_header", { mode: "boolean" }).notNull(),
    payloadJson: text("payload_json").notNull(),
    lineCount: integer("line_count").notNull(),
    totalPartQty: integer("total_part_qty").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.subjectKind, t.subjectId] }),
    index("build_saved_parts_updated_idx").on(t.updatedAt),
  ]
);

/** 显示名与标签（与零件表、图、附件同一主体） */
export const buildProfiles = sqliteTable(
  "build_profiles",
  {
    subjectKind: text("subject_kind").notNull(),
    subjectId: text("subject_id").notNull(),
    displayName: text("display_name").notNull().default(""),
    tagsJson: text("tags_json").notNull(),
    profileUpdatedAt: text("profile_updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.subjectKind, t.subjectId] }),
    index("build_profiles_updated_idx").on(t.profileUpdatedAt),
  ]
);

/** 用户上传参考图；文件在 data/build-uploads/<kind>/<subject_id>/ */
export const buildImages = sqliteTable(
  "build_images",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    subjectKind: text("subject_kind").notNull(),
    subjectId: text("subject_id").notNull(),
    storedFile: text("stored_file").notNull().unique(),
    originalName: text("original_name"),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("build_images_subject_idx").on(t.subjectKind, t.subjectId)]
);

/** 说明书 PDF、Studio .io 等 */
export const buildAttachments = sqliteTable(
  "build_attachments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    subjectKind: text("subject_kind").notNull(),
    subjectId: text("subject_id").notNull(),
    storedFile: text("stored_file").notNull().unique(),
    originalName: text("original_name"),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("build_attachments_subject_idx").on(t.subjectKind, t.subjectId)]
);
