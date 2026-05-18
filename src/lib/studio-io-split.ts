import type { ParsedStudioIo, StudioIoMainStep, StudioIoPlacement } from "@/lib/parse-studio-io";

export type IoSplitMode =
  | "step_interval"
  | "piece_interval"
  | "by_color"
  | "by_category"
  | "manual";

export type IoSplitConfig =
  | { mode: "step_interval"; everySteps: number }
  | { mode: "piece_interval"; everyPieces: number }
  | { mode: "by_color" }
  | { mode: "by_category" }
  | { mode: "manual"; groups: { label: string; stepIndexes: number[] }[] };

export type IoSplitBatchDraft = {
  label: string;
  stepFrom: number;
  stepTo: number;
  stepIndexes: number[];
  placements: StudioIoPlacement[];
};

/** 仅含步骤元数据时的拆分轮廓（用于 UI 即时展示包数与步骤范围） */
export type IoSplitBatchOutline = {
  label: string;
  stepFrom: number;
  stepTo: number;
  stepIndexes: number[];
  pieceCount: number;
};

export type IoSplitStepMeta = {
  stepIndex: number;
  newPlacementCount: number;
};

function pieceCountForStepIndexes(steps: IoSplitStepMeta[], indexes: number[]): number {
  const set = new Set(indexes);
  return steps.reduce((n, s) => (set.has(s.stepIndex) ? n + s.newPlacementCount : n), 0);
}

function outlineFromStepChunks(
  steps: IoSplitStepMeta[],
  chunks: number[][]
): IoSplitBatchOutline[] {
  return chunks
    .map((chunk) => {
      if (chunk.length === 0) return null;
      const from = chunk[0]!;
      const to = chunk[chunk.length - 1]!;
      const pieceCount = pieceCountForStepIndexes(steps, chunk);
      return {
        label: `步骤 ${from}${to !== from ? `–${to}` : ""}`,
        stepFrom: from,
        stepTo: to,
        stepIndexes: chunk,
        pieceCount,
      };
    })
    .filter((b): b is IoSplitBatchOutline => b != null && b.pieceCount > 0);
}

/** 根据主场景步骤元数据即时估算将拆成几包（不含按色/按类的具体种类数） */
export function estimateIoSplitOutline(
  steps: IoSplitStepMeta[],
  config: IoSplitConfig
): IoSplitBatchOutline[] {
  if (steps.length === 0) return [];

  const indexes = steps.map((s) => s.stepIndex);

  if (config.mode === "step_interval") {
    const n = Math.max(1, Math.floor(config.everySteps));
    const chunks: number[][] = [];
    for (let i = 0; i < indexes.length; i += n) {
      chunks.push(indexes.slice(i, i + n));
    }
    return outlineFromStepChunks(steps, chunks);
  }

  if (config.mode === "piece_interval") {
    const n = Math.max(1, Math.floor(config.everyPieces));
    const chunks: number[][] = [];
    let chunk: number[] = [];
    let chunkPieces = 0;
    let batchNo = 1;

    const flush = () => {
      if (chunk.length === 0) return;
      const pieceCount = pieceCountForStepIndexes(steps, chunk);
      if (pieceCount > 0) {
        chunks.push([...chunk]);
      }
      chunk = [];
      chunkPieces = 0;
      batchNo += 1;
      void batchNo;
    };

    for (const st of steps) {
      const count = st.newPlacementCount;
      if (chunkPieces > 0 && chunkPieces + count > n) {
        flush();
      }
      chunk.push(st.stepIndex);
      chunkPieces += count;
      if (chunkPieces >= n) {
        flush();
      }
    }
    flush();

    return chunks.map((c, i) => {
      const from = c[0]!;
      const to = c[c.length - 1]!;
      const pieceCount = pieceCountForStepIndexes(steps, c);
      return {
        label: `约 ${pieceCount} 片`,
        stepFrom: from,
        stepTo: to,
        stepIndexes: c,
        pieceCount,
      };
    });
  }

  if (config.mode === "manual") {
    return config.groups
      .map((g, i) => {
        const stepIndexes = [...new Set(g.stepIndexes)].sort((a, b) => a - b);
        const pieceCount = pieceCountForStepIndexes(steps, stepIndexes);
        if (pieceCount === 0) return null;
        return {
          label: g.label.trim() || `批次 ${i + 1}`,
          stepFrom: stepIndexes[0] ?? 0,
          stepTo: stepIndexes[stepIndexes.length - 1] ?? 0,
          stepIndexes,
          pieceCount,
        };
      })
      .filter((b): b is IoSplitBatchOutline => b != null);
  }

  if (config.mode === "by_color" || config.mode === "by_category") {
    const total = pieceCountForStepIndexes(steps, indexes);
    return [
      {
        label: config.mode === "by_color" ? "按颜色拆分（解析后确定包数）" : "按类别拆分（解析后确定包数）",
        stepFrom: indexes[0] ?? 0,
        stepTo: indexes[indexes.length - 1] ?? 0,
        stepIndexes: indexes,
        pieceCount: total,
      },
    ];
  }

  return [];
}

function aggregatePlacements(placements: StudioIoPlacement[]): StudioIoPlacement[] {
  const map = new Map<string, { partNum: string; ldrawColorId: number; qty: number; isSubmodelRef: boolean }>();
  for (const p of placements) {
    const key = `${p.partNum}\t${p.ldrawColorId}`;
    const cur = map.get(key);
    if (cur) {
      cur.qty += 1;
    } else {
      map.set(key, {
        partNum: p.partNum,
        ldrawColorId: p.ldrawColorId,
        qty: 1,
        isSubmodelRef: p.isSubmodelRef,
      });
    }
  }
  const out: StudioIoPlacement[] = [];
  for (const v of map.values()) {
    for (let i = 0; i < v.qty; i++) {
      out.push({
        partNum: v.partNum,
        ldrawColorId: v.ldrawColorId,
        isSubmodelRef: v.isSubmodelRef,
      });
    }
  }
  return out;
}

function placementsForSteps(steps: StudioIoMainStep[], indexes: number[]): StudioIoPlacement[] {
  const set = new Set(indexes);
  const raw: StudioIoPlacement[] = [];
  for (const st of steps) {
    if (set.has(st.stepIndex)) {
      raw.push(...st.newPlacements);
    }
  }
  return aggregatePlacements(raw);
}

function splitByStepInterval(parsed: ParsedStudioIo, everySteps: number): IoSplitBatchDraft[] {
  const n = Math.max(1, Math.floor(everySteps));
  const indexes = parsed.mainSteps.map((s) => s.stepIndex);
  const batches: IoSplitBatchDraft[] = [];
  for (let i = 0; i < indexes.length; i += n) {
    const chunk = indexes.slice(i, i + n);
    const from = chunk[0]!;
    const to = chunk[chunk.length - 1]!;
    batches.push({
      label: `步骤 ${from}${to !== from ? `–${to}` : ""}`,
      stepFrom: from,
      stepTo: to,
      stepIndexes: chunk,
      placements: placementsForSteps(parsed.mainSteps, chunk),
    });
  }
  return batches.filter((b) => b.placements.length > 0);
}

function splitByPieceInterval(parsed: ParsedStudioIo, everyPieces: number): IoSplitBatchDraft[] {
  const n = Math.max(1, Math.floor(everyPieces));
  const batches: IoSplitBatchDraft[] = [];
  let chunkIndexes: number[] = [];
  let chunkPieces = 0;
  let batchNo = 1;

  const flush = () => {
    if (chunkIndexes.length === 0) return;
    const from = chunkIndexes[0]!;
    const to = chunkIndexes[chunkIndexes.length - 1]!;
    const placements = placementsForSteps(parsed.mainSteps, chunkIndexes);
    if (placements.length > 0) {
      batches.push({
        label: `批次 ${batchNo}（约 ${placements.length} 片）`,
        stepFrom: from,
        stepTo: to,
        stepIndexes: [...chunkIndexes],
        placements,
      });
      batchNo += 1;
    }
    chunkIndexes = [];
    chunkPieces = 0;
  };

  for (const st of parsed.mainSteps) {
    const count = st.newPlacements.length;
    if (chunkPieces > 0 && chunkPieces + count > n) {
      flush();
    }
    chunkIndexes.push(st.stepIndex);
    chunkPieces += count;
    if (chunkPieces >= n) {
      flush();
    }
  }
  flush();
  return batches;
}

function splitByColor(parsed: ParsedStudioIo): IoSplitBatchDraft[] {
  const all = placementsForSteps(
    parsed.mainSteps,
    parsed.mainSteps.map((s) => s.stepIndex)
  );
  const byColor = new Map<number, StudioIoPlacement[]>();
  for (const p of all) {
    const list = byColor.get(p.ldrawColorId) ?? [];
    list.push(p);
    byColor.set(p.ldrawColorId, list);
  }
  return [...byColor.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([colorId, placements]) => ({
      label: `颜色 ${colorId}`,
      stepFrom: 0,
      stepTo: parsed.mainSteps[parsed.mainSteps.length - 1]?.stepIndex ?? 0,
      stepIndexes: parsed.mainSteps.map((s) => s.stepIndex),
      placements: aggregatePlacements(placements),
    }))
    .filter((b) => b.placements.length > 0);
}

/** 按零件大类：在已解析的 ShortageResolveItem 上拆分（由 actions 调用） */
export function splitResolvedItemsByCategory<T extends { partCatName: string | null; rest: string }>(
  items: T[],
  parsed: ParsedStudioIo
): { label: string; items: T[]; stepFrom: number; stepTo: number; stepIndexes: number[] }[] {
  const byCat = new Map<string, T[]>();
  for (const row of items) {
    const cat = row.rest.includes("子组件") ? "子组件" : row.partCatName?.trim() || "未分类";
    const list = byCat.get(cat) ?? [];
    list.push(row);
    byCat.set(cat, list);
  }
  const lastStep = parsed.mainSteps[parsed.mainSteps.length - 1]?.stepIndex ?? 0;
  const allIndexes = parsed.mainSteps.map((s) => s.stepIndex);
  return [...byCat.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "zh"))
    .map(([label, groupItems]) => ({
      label,
      items: groupItems,
      stepFrom: 0,
      stepTo: lastStep,
      stepIndexes: allIndexes,
    }));
}

export function formatIoSplitConfigSummary(config: IoSplitConfig): string {
  switch (config.mode) {
    case "step_interval":
      return `每 ${config.everySteps} 个主场景步骤一包`;
    case "piece_interval":
      return `约每 ${config.everyPieces} 片一包`;
    case "by_color":
      return "按颜色分包（整模）";
    case "by_category":
      return "按零件类别分包（整模）";
    case "manual":
      return `手动分包（${config.groups.length} 组）`;
    default:
      return "自定义分包";
  }
}

export function defaultRuleLabelForConfig(config: IoSplitConfig): string {
  switch (config.mode) {
    case "step_interval":
      return `每 ${config.everySteps} 步一包`;
    case "piece_interval":
      return `每 ${config.everyPieces} 片一包`;
    case "by_color":
      return "按颜色";
    case "by_category":
      return "按类别";
    case "manual":
      return "手动分包";
    default:
      return "Studio 分步";
  }
}

export function parseIoSplitConfigJson(json: string): IoSplitConfig | null {
  try {
    const v = JSON.parse(json) as IoSplitConfig;
    if (v && typeof v === "object" && "mode" in v) return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function splitStudioIoByConfig(parsed: ParsedStudioIo, config: IoSplitConfig): IoSplitBatchDraft[] {
  switch (config.mode) {
    case "step_interval":
      return splitByStepInterval(parsed, config.everySteps);
    case "piece_interval":
      return splitByPieceInterval(parsed, config.everyPieces);
    case "by_color":
      return splitByColor(parsed);
    case "by_category":
      return [
        {
          label: "全部",
          stepFrom: parsed.mainSteps[0]?.stepIndex ?? 0,
          stepTo: parsed.mainSteps[parsed.mainSteps.length - 1]?.stepIndex ?? 0,
          stepIndexes: parsed.mainSteps.map((s) => s.stepIndex),
          placements: placementsForSteps(
            parsed.mainSteps,
            parsed.mainSteps.map((s) => s.stepIndex)
          ),
        },
      ];
    case "manual": {
      return config.groups
        .map((g, i) => {
          const indexes = [...new Set(g.stepIndexes)].sort((a, b) => a - b);
          const placements = placementsForSteps(parsed.mainSteps, indexes);
          return {
            label: g.label.trim() || `自定义 ${i + 1}`,
            stepFrom: indexes[0] ?? 0,
            stepTo: indexes[indexes.length - 1] ?? 0,
            stepIndexes: indexes,
            placements,
          };
        })
        .filter((b) => b.placements.length > 0);
    }
    default:
      return [];
  }
}
