import * as schema from "./schema";

/** Drizzle：仅目录表（rebrickable.db） */
export const catalogSchema = {
  colors: schema.colors,
  partCategories: schema.partCategories,
  parts: schema.parts,
  elements: schema.elements,
  legoThemes: schema.legoThemes,
  legoSets: schema.legoSets,
  inventories: schema.inventories,
  inventoryParts: schema.inventoryParts,
  minifigs: schema.minifigs,
  inventoryMinifigs: schema.inventoryMinifigs,
  partRelationships: schema.partRelationships,
};

/** Drizzle：仅用户表（rebrickable-user.db） */
export const userSchema = {
  buildSavedPartsSheets: schema.buildSavedPartsSheets,
  buildIoStepBatches: schema.buildIoStepBatches,
  buildManualSplitPlans: schema.buildManualSplitPlans,
  buildManualSplitBags: schema.buildManualSplitBags,
  buildProfiles: schema.buildProfiles,
  buildImages: schema.buildImages,
  buildAttachments: schema.buildAttachments,
  buildReplicatePhases: schema.buildReplicatePhases,
  buildOwnedSubjects: schema.buildOwnedSubjects,
  buildOwnedParts: schema.buildOwnedParts,
  buildFavoriteSubjects: schema.buildFavoriteSubjects,
  buildFavoriteParts: schema.buildFavoriteParts,
  buildPurchaseListItems: schema.buildPurchaseListItems,
  buildSetGoodPrices: schema.buildSetGoodPrices,
  buildBricktimeConfig: schema.buildBricktimeConfig,
};
