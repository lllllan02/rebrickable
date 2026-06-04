import {
  index,
  integer,
  real,
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
    /** 首次保存本行零件表的时间（ISO）；MOC 列表排序用，缺件检查等更新 updated_at 时不改此列 */
    firstSavedAt: text("first_saved_at"),
    /** 缺件表行数；无缺件表分支时为 null */
    shortageLineCount: integer("shortage_line_count"),
    /** 缺件表各行列 quantity 之和；无缺件表时为 null */
    shortageTotalQty: integer("shortage_total_qty"),
    /** 缺件汇总是否与 payload 同步过（0 表示待迁移/回填） */
    shortageStatsOk: integer("shortage_stats_ok", { mode: "boolean" }).notNull().default(false),
    /** 用户通过「标记为不缺」确认无缺件表的时间（ISO）；仅此时列表显示「不缺件」 */
    shortageClearedAt: text("shortage_cleared_at"),
    /** 最近一次高砖缺件对照成功完成的时间（ISO）；无缺件行时用于列表显示「全」 */
    gobricksShortageSyncAt: text("gobricks_shortage_sync_at"),
    /**
     * 高砖 `lego2ItemList` 根字段 `gdsPrice` 之和（元）：按完整 BOM 分片请求时各响应汇总；
     * 表示整单参考价（非缺件子集）。上传新完整表时置 null。
     */
    gobricksGdsPriceCny: real("gobricks_gds_price_cny"),
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
    /** 冗余：是否存在 PDF 说明书附件（由上传/删除附件时同步，列表不查 build_attachments） */
    hasInstructionsPdf: integer("has_instructions_pdf", { mode: "boolean" })
      .notNull()
      .default(false),
    /** 冗余：是否存在 .io 源文件附件 */
    hasIoSource: integer("has_io_source", { mode: "boolean" }).notNull().default(false),
    /** 仅 MOC：是否标记为 Premium */
    isPremium: integer("is_premium", { mode: "boolean" }).notNull().default(false),
    /** 仅 MOC：改编自的官方套装 set_num；无则为 null */
    derivedFromSetNum: text("derived_from_set_num"),
  },
  (t) => [
    primaryKey({ columns: [t.subjectKind, t.subjectId] }),
    index("build_profiles_updated_idx").on(t.profileUpdatedAt),
    index("build_profiles_derived_set_idx").on(t.derivedFromSetNum),
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

/**
 * Studio .io 分步拆出的零件表批次（每批独立 full/shortage/fulfillment JSON，与主 MOC 零件表并存）。
 */
export const buildIoStepBatches = sqliteTable(
  "build_io_step_batches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    subjectKind: text("subject_kind").notNull(),
    subjectId: text("subject_id").notNull(),
    attachmentId: integer("attachment_id").notNull(),
    /** 同一 .io 下可并存多套分包方案 */
    ruleLabel: text("rule_label").notNull().default(""),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull(),
    splitMode: text("split_mode").notNull(),
    splitConfigJson: text("split_config_json").notNull(),
    mainStepFrom: integer("main_step_from").notNull(),
    mainStepTo: integer("main_step_to").notNull(),
    mainStepIndexesJson: text("main_step_indexes_json").notNull(),
    skippedHeader: integer("skipped_header", { mode: "boolean" }).notNull(),
    payloadJson: text("payload_json").notNull(),
    lineCount: integer("line_count").notNull(),
    totalPartQty: integer("total_part_qty").notNull(),
    updatedAt: text("updated_at").notNull(),
    firstSavedAt: text("first_saved_at"),
    shortageLineCount: integer("shortage_line_count"),
    shortageTotalQty: integer("shortage_total_qty"),
    shortageStatsOk: integer("shortage_stats_ok", { mode: "boolean" }).notNull().default(false),
    shortageClearedAt: text("shortage_cleared_at"),
    gobricksShortageSyncAt: text("gobricks_shortage_sync_at"),
    gobricksGdsPriceCny: real("gobricks_gds_price_cny"),
  },
  (t) => [
    index("build_io_batches_subject_idx").on(t.subjectKind, t.subjectId),
    index("build_io_batches_attachment_idx").on(t.attachmentId),
  ]
);

/** 复刻阶段：成对保存 Studio 渲染图与 .io 快照（仅 MOC） */
export const buildReplicatePhases = sqliteTable(
  "build_replicate_phases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    subjectKind: text("subject_kind").notNull(),
    subjectId: text("subject_id").notNull(),
    label: text("label").notNull(),
    note: text("note"),
    sortOrder: integer("sort_order").notNull(),
    renderStoredFile: text("render_stored_file").notNull().unique(),
    renderMimeType: text("render_mime_type").notNull(),
    renderByteSize: integer("render_byte_size").notNull(),
    renderOriginalName: text("render_original_name"),
    ioStoredFile: text("io_stored_file").notNull().unique(),
    ioMimeType: text("io_mime_type").notNull(),
    ioByteSize: integer("io_byte_size").notNull(),
    ioOriginalName: text("io_original_name"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("build_replicate_phases_subject_idx").on(t.subjectKind, t.subjectId)]
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

/** 用户拼搭进度（还原 / 待采 / 拥有）；仅 MOC / 套装 */
export const buildOwnedSubjects = sqliteTable(
  "build_owned_subjects",
  {
    subjectKind: text("subject_kind").notNull(),
    subjectId: text("subject_id").notNull(),
    /** collected | replicate | purchase | complete */
    workflowStage: text("workflow_stage").notNull(),
    markedAt: text("marked_at").notNull(),
    collectedAt: text("collected_at"),
    replicateAt: text("replicate_at"),
    purchaseAt: text("purchase_at"),
    completeAt: text("complete_at"),
  },
  (t) => [
    primaryKey({ columns: [t.subjectKind, t.subjectId] }),
    index("build_owned_kind_idx").on(t.subjectKind),
    index("build_owned_stage_idx").on(t.workflowStage),
  ]
);

/** 用户「收藏」的套装 / MOC（与拥有、是否已存零件表无关） */
export const buildFavoriteSubjects = sqliteTable(
  "build_favorite_subjects",
  {
    subjectKind: text("subject_kind").notNull(),
    subjectId: text("subject_id").notNull(),
    markedAt: text("marked_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.subjectKind, t.subjectId] }),
    index("build_favorite_kind_idx").on(t.subjectKind),
  ]
);

/** 官方套装用户记录的可购买好价（元）；与高砖参考价无关 */
export const buildSetGoodPrices = sqliteTable(
  "build_set_good_prices",
  {
    setNum: text("set_num").primaryKey(),
    priceNewCny: real("price_new_cny"),
    priceUsedCny: real("price_used_cny"),
    /** 全新价渠道：拼多多 | 淘宝 */
    channelNew: text("channel_new"),
    /** 官方 BOM 对照高砖后的零件总价（元）；不含零件未匹配行 */
    gobricksPriceCny: real("gobricks_price_cny"),
    /** 零件匹配占比（0–100） */
    gobricksMatchPercent: real("gobricks_match_percent"),
    /** 最近一次高砖比价完成时间（ISO） */
    gobricksComparedAt: text("gobricks_compared_at"),
    /** Bricktime 官方定价 */
    bricktimeOfficialPrice: text("bricktime_official_price"),
    /** Bricktime 超值入手价 */
    bricktimeGoodPrice: text("bricktime_good_price"),
    /** Bricktime 史低价 */
    bricktimeLowestPrice: text("bricktime_lowest_price"),
    /** Bricktime 近 3 个月电商低价 */
    bricktimeRecentLowPrice: text("bricktime_recent_low_price"),
    /** 最近一次 Bricktime 价格抓取完成时间（ISO） */
    bricktimeFetchedAt: text("bricktime_fetched_at"),
    /** Bricktime 上市日期 */
    bricktimeLaunchDate: text("bricktime_launch_date"),
    /** Bricktime 绝版日期 */
    bricktimeRetiredDate: text("bricktime_retired_date"),
    /** Bricktime 销售状态（如「新品」「绝版」） */
    bricktimeSalesStatus: text("bricktime_sales_status"),
    /** 最近一次 Bricktime 销售状态抓取完成时间（ISO） */
    bricktimeSalesStatusFetchedAt: text("bricktime_sales_status_fetched_at"),
    /** Bricktime 重量 */
    bricktimeWeight: text("bricktime_weight"),
    /** Bricktime 拼搭时间 */
    bricktimeBuildingTime: text("bricktime_building_time"),
    /** Bricktime 电商价格历史（JSON：[{ price, updateTime }]） */
    bricktimePriceHistory: text("bricktime_price_history"),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("build_set_good_prices_updated_idx").on(t.updatedAt)]
);

/** Bricktime 开放 API 配置（单行 id=1） */
export const buildBricktimeConfig = sqliteTable("build_bricktime_config", {
  id: integer("id").primaryKey(),
  userUuid: text("user_uuid"),
  apiKey: text("api_key"),
  apiKeyExpiresAt: text("api_key_expires_at"),
  updatedAt: text("updated_at").notNull(),
});
