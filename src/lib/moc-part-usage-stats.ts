/** 单个 MOC 完整零件表中的一行（调用方已按需裁剪字段） */
export type MocPartUsageInputItem = {
  partNum: string;
  quantity: number;
};

export type MocPartUsageInputSheet = {
  mocId: string;
  items: MocPartUsageInputItem[];
};

export type MocPartUsageStatRow = {
  partNum: string;
  /** Coverage × RelMeanAmongUsers */
  score: number;
  /** 使用了该零件的作品数 / 有效参与统计的作品数 N */
  coverage: number;
  /** 使用了该零件的作品数 */
  mocCount: number;
  /** 有效参与统计的作品数 N */
  selectedMocCount: number;
  /** 仅在用过该零件的作品上对 Rel 取平均 */
  relMeanAmongUsers: number;
  /** 跨作品 quantity 总和（仅参考，不参与主排序） */
  totalQtyAcrossMocs: number;
};

/** 展示用补全字段（可在 client 组件中引用） */
export type MocPartUsageEnrichedRow = MocPartUsageStatRow & {
  partName: string | null;
  imgUrl: string | null;
  inPurchaseList: boolean;
  isFavorite: boolean;
};

export type MocPartUsageSkipped = {
  mocId: string;
  reason: string;
};

export type MocPartUsageStatsResult = {
  /** 有效计入 N 的作品 ID */
  analyzedMocIds: string[];
  rows: MocPartUsageStatRow[];
};

/**
 * 按 partNum 合并颜色后，计算 Coverage × RelMeanAmongUsers 排行。
 * 某作品合并后无有效零件则不计入 N。
 */
export function computeMocPartUsageStats(sheets: MocPartUsageInputSheet[]): MocPartUsageStatsResult {
  type Acc = {
    mocCount: number;
    relSum: number;
    totalQty: number;
  };

  const byPart = new Map<string, Acc>();
  const analyzedMocIds: string[] = [];

  for (const sheet of sheets) {
    const qtyByPart = new Map<string, number>();
    for (const item of sheet.items) {
      const partNum = typeof item.partNum === "string" ? item.partNum.trim() : "";
      if (!partNum) continue;
      const qty = item.quantity;
      if (typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0) continue;
      qtyByPart.set(partNum, (qtyByPart.get(partNum) ?? 0) + qty);
    }
    if (qtyByPart.size === 0) continue;

    let maxQty = 0;
    for (const qty of qtyByPart.values()) {
      if (qty > maxQty) maxQty = qty;
    }
    if (maxQty <= 0) continue;

    analyzedMocIds.push(sheet.mocId);

    for (const [partNum, qty] of qtyByPart) {
      const rel = qty / maxQty;
      const prev = byPart.get(partNum);
      if (prev) {
        prev.mocCount += 1;
        prev.relSum += rel;
        prev.totalQty += qty;
      } else {
        byPart.set(partNum, { mocCount: 1, relSum: rel, totalQty: qty });
      }
    }
  }

  const n = analyzedMocIds.length;
  if (n === 0) {
    return { analyzedMocIds, rows: [] };
  }

  const rows: MocPartUsageStatRow[] = [];
  for (const [partNum, acc] of byPart) {
    const coverage = acc.mocCount / n;
    const relMeanAmongUsers = acc.relSum / acc.mocCount;
    rows.push({
      partNum,
      score: coverage * relMeanAmongUsers,
      coverage,
      mocCount: acc.mocCount,
      selectedMocCount: n,
      relMeanAmongUsers,
      totalQtyAcrossMocs: acc.totalQty,
    });
  }

  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.coverage !== a.coverage) return b.coverage - a.coverage;
    return a.partNum.localeCompare(b.partNum, "en");
  });

  return { analyzedMocIds, rows };
}
