import type { ParsedStudioIo, StudioIoPlacement } from "@/lib/parse-studio-io";

/**
 * 与 MOC 完整表对照 / 按色·按类分包时选用全模砖表。
 * 默认取片数较多的一侧；若分步明显多于 lxfml BOM（多 SubModel Group 重复计步），则改用 BOM。
 *
 * 独立模块供 `studio-io-split`（客户端向导）引用，避免拉入 `parse-studio-io` 的 SQLite 依赖。
 */
export function pickStudioIoBomPlacements(parsed: ParsedStudioIo): StudioIoPlacement[] {
  const fromSteps = parsed.mainSteps.flatMap((s) => s.newPlacements);
  const fromBom = parsed.bomPlacements;
  if (!fromBom.length) return fromSteps;
  if (!fromSteps.length) return fromBom;

  // model.lxfml 零件清单为整模对照与分包片数准绳；分步展开可能重复计步或色码与清单不一致。
  if (parsed.brickCatalog?.size) return fromBom;

  const stepN = fromSteps.length;
  const bomN = fromBom.length;
  if (bomN > 0 && stepN > bomN && (stepN - bomN) / bomN > 0.05) {
    return fromBom;
  }

  return fromBom.length >= fromSteps.length ? fromBom : fromSteps;
}
