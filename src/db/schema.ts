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
