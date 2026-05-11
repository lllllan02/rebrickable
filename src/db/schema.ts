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

/** Rebrickable sets.csv：含套装盒图 img_url（与 inventory 里的零件图不同） */
export const legoSets = sqliteTable(
  "sets",
  {
    setNum: text("set_num").primaryKey(),
    name: text("name").notNull(),
    year: integer("year"),
    themeId: integer("theme_id"),
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

/** MOC 导入页按 MOC ID 保存的解析结果（JSON），同一 ID 再次保存即覆盖 */
export const mocSavedPartsSheets = sqliteTable(
  "moc_saved_parts_sheets",
  {
    mocId: text("moc_id").primaryKey(),
    skippedHeader: integer("skipped_header", { mode: "boolean" }).notNull(),
    payloadJson: text("payload_json").notNull(),
    lineCount: integer("line_count").notNull(),
    /** 各行列 quantity 之和（零件总个数），非行数 */
    totalPartQty: integer("total_part_qty").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("moc_saved_parts_updated_idx").on(t.updatedAt)]
);

/** MOC 显示名称与自定义标签（moc_id 与已存零件表、图片表一致） */
export const mocProfiles = sqliteTable(
  "moc_profiles",
  {
    mocId: text("moc_id").primaryKey(),
    displayName: text("display_name").notNull().default(""),
    tagsJson: text("tags_json").notNull(),
    profileUpdatedAt: text("profile_updated_at").notNull(),
  },
  (t) => [index("moc_profiles_updated_idx").on(t.profileUpdatedAt)]
);

/** MOC 详情页用户上传的参考图（二进制在 data/moc-uploads/<moc_id>/ 下） */
export const mocImages = sqliteTable(
  "moc_images",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mocId: text("moc_id").notNull(),
    storedFile: text("stored_file").notNull().unique(),
    originalName: text("original_name"),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("moc_images_moc_idx").on(t.mocId)]
);
