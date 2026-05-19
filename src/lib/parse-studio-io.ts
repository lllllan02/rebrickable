import {
  legoMechanicalPartKey,
  legoMechanicalPartKeysEquivalent,
} from "@/lib/lego-mechanical-part-key";
import { parseStudioLxfmlBomBricks, type StudioLxfmlBrick } from "@/lib/parse-studio-lxfml";
import { buildPartSubstituteClosure } from "@/lib/part-substitute-closure";
import {
  catalogBrickRefRepresentsSameElementAsPlacement,
  lxfmlBomCoversPlacementElement,
  type StudioIoElementLookup,
} from "@/lib/studio-io-item-lookup";

/** BrickLink Studio .io 固定 ZIP 密码（公开约定） */
export const STUDIO_IO_ZIP_PASSWORD = "soho0909";

/** Studio 在 model.ldr 中对扩展 LDraw 色使用 100000 + 真实色码（如 100167 → 167）。 */
export const STUDIO_EXTENDED_LDRAW_COLOR_OFFSET = 100_000;

export type StudioIoPlacement = {
  /** LDraw .dat 名（去后缀）或子模型名 */
  partNum: string;
  ldrawColorId: number;
  /**
   * model.lxfml 的 itemNos，写入导入 CSV 的 ElementId 列作目录查找键；
   * 仅当命中 `elements` 表时才会覆盖 part_num / color_id（见 resolvePartsSheetCsvRowIdentities）。
   */
  legoItemNo?: string | null;
  /** modelv2.ldr type-11 行中的砖块 refID */
  brickRefId?: number;
  /** 来自子模型引用且未能展开 */
  isSubmodelRef: boolean;
  submodelName?: string;
};

export type ParseStudioIoOptions = {
  /** model.lxfml 砖块目录（itemNos / designID） */
  brickCatalog?: ReadonlyMap<number, StudioLxfmlBrick>;
  /** 原始 model.lxfml 文本；用于生成与 Studio 零件清单一致的 BOM */
  lxfmlText?: string;
  /**
   * elements 表 element_id 对照（服务端由 `buildStudioIoElementLookup` 注入）。
   * 用于判断 brickRef itemNos 与 LDR .dat 是否同一物理件，替代硬编码模具对。
   */
  elementLookup?: StudioIoElementLookup;
};

/**
 * 将 Studio model.ldr 中的扩展色码还原为 LDraw 色码（如 100167 → 167）。
 * 注意：LDraw 色码与 Rebrickable `colors.id` 多数相同，但新色（如 167）在 RB 中可能是别的 ID（如 1136）；
 * 零件表颜色应以 `itemNos` 查 `elements` 为准，不能单靠此函数当 RB 色 ID。
 */
export function normalizeStudioLdrawColorId(color: number): number {
  if (!Number.isFinite(color)) return color;
  if (color >= STUDIO_EXTENDED_LDRAW_COLOR_OFFSET) {
    return color - STUDIO_EXTENDED_LDRAW_COLOR_OFFSET;
  }
  return color;
}

/**
 * Studio / BrickLink 自定义 LDraw 件名（如 `bl_24855.dat`）去掉 `bl_` 后与 Rebrickable design 一致。
 */
export function normalizeStudioLdrawPartNum(partNum: string): string {
  const p = partNum.trim().replace(/\.dat$/i, "");
  if (!p) return p;
  return p.toLowerCase().startsWith("bl_") ? p.slice(3) : p;
}

export type StudioIoMainStep = {
  stepIndex: number;
  title: string;
  description: string | null;
  newPlacements: StudioIoPlacement[];
};

export type ParsedStudioIo = {
  modelName: string;
  studioVersion: string | null;
  mainSteps: StudioIoMainStep[];
  submodels: string[];
  /**
   * 主场景全部砖（lxfml 零件清单或 LDR 展开），用于与 MOC 完整零件表对照。
   * 与 `mainSteps` 累加不一致时由 `pickStudioIoBomPlacements` 选取（分步重复计步时优先 BOM）。
   */
  bomPlacements: StudioIoPlacement[];
  /** model.lxfml 砖块目录（供 itemNos 回填） */
  brickCatalog?: ReadonlyMap<number, StudioLxfmlBrick>;
};

/** LDraw type-1/10：color + xyz + 3×3 矩阵共 13 个字段后即为零件/子模型文件名（可含空格）。 */
const LDRAW_TYPE1_FILENAME_START = 14;
/** Studio modelv2 type-11：color + brickRefId + False + 0 + xyz + 3×3 矩阵（共 17 个字段）后即为文件名。 */
const LDRAW_TYPE11_FILENAME_START = 17;

function attachBrickCatalog(
  placement: StudioIoPlacement,
  brickCatalog: ReadonlyMap<number, StudioLxfmlBrick> | undefined
): StudioIoPlacement {
  if (!brickCatalog || placement.brickRefId == null) return placement;
  const brick = brickCatalog.get(placement.brickRefId);
  if (!brick || !legoMechanicalPartKeysEquivalent(brick.designId, placement.partNum)) {
    return placement;
  }
  return {
    ...placement,
    legoItemNo: brick.legoItemNo,
  };
}

function parsePartLine(
  line: string,
  brickCatalog?: ReadonlyMap<number, StudioLxfmlBrick>
): StudioIoPlacement | null {
  const parts = line.trim().split(/\s+/);
  if (!parts.length) return null;

  const lineType = parts[0];
  if (lineType === "1" || lineType === "10") {
    if (parts.length < LDRAW_TYPE1_FILENAME_START + 1) return null;
    const rawColor = Number.parseInt(parts[1] ?? "", 10);
    if (!Number.isFinite(rawColor)) return null;
    const fileToken = parts.slice(LDRAW_TYPE1_FILENAME_START).join(" ").trim();
    if (!fileToken) return null;
    const isDat = fileToken.toLowerCase().endsWith(".dat");
    if (isDat) {
      return {
        partNum: normalizeStudioLdrawPartNum(fileToken),
        ldrawColorId: rawColor,
        isSubmodelRef: false,
      };
    }
    return {
      partNum: fileToken,
      ldrawColorId: rawColor,
      isSubmodelRef: true,
      submodelName: fileToken,
    };
  }

  if (lineType === "11") {
    if (parts.length < LDRAW_TYPE11_FILENAME_START + 1) return null;
    const rawColor = Number.parseInt(parts[1] ?? "", 10);
    const brickRefId = Number.parseInt(parts[2] ?? "", 10);
    if (!Number.isFinite(rawColor) || !Number.isFinite(brickRefId)) return null;
    const fileToken = parts.slice(LDRAW_TYPE11_FILENAME_START).join(" ").trim();
    if (!fileToken) return null;
    const isDat = fileToken.toLowerCase().endsWith(".dat");
    const base: StudioIoPlacement = isDat
      ? {
          partNum: normalizeStudioLdrawPartNum(fileToken),
          ldrawColorId: rawColor,
          brickRefId,
          isSubmodelRef: false,
        }
      : {
          partNum: fileToken,
          ldrawColorId: rawColor,
          brickRefId,
          isSubmodelRef: true,
          submodelName: fileToken,
        };
    return attachBrickCatalog(base, brickCatalog);
  }

  return null;
}

type MpdSection = {
  name: string;
  lines: string[];
};

/** Studio 导出的 model.ldr 常带 UTF-8 BOM，会导致首行 `0 FILE` 无法识别。 */
export function normalizeStudioLdrText(ldrText: string): string {
  return ldrText.replace(/^\uFEFF/, "");
}

export function parseMpdSections(ldrText: string): MpdSection[] {
  const sections: MpdSection[] = [];
  let current: MpdSection | null = null;
  for (const line of normalizeStudioLdrText(ldrText).split(/\r?\n/)) {
    if (line.startsWith("0 FILE ")) {
      if (current) sections.push(current);
      current = { name: line.slice(7).trim(), lines: [] };
    } else if (line.startsWith("0 NOFILE")) {
      if (current) sections.push(current);
      current = null;
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push(current);
  return sections;
}

function findSection(sectionByName: Map<string, MpdSection>, key: string): MpdSection | undefined {
  const trimmed = key.trim();
  return (
    sectionByName.get(trimmed) ??
    sectionByName.get(trimmed.toLowerCase()) ??
    [...sectionByName.entries()].find(([n]) => n.toLowerCase() === trimmed.toLowerCase())?.[1]
  );
}

function buildSectionByName(sections: MpdSection[]): Map<string, MpdSection> {
  const sectionByName = new Map<string, MpdSection>();
  for (const s of sections) {
    sectionByName.set(s.name, s);
    sectionByName.set(s.name.toLowerCase(), s);
  }
  return sectionByName;
}

const SUBMODEL_GROUP_SECTION_RE = /^SubModel Group \d+$/i;

function isSubModelGroupSectionName(name: string): boolean {
  return SUBMODEL_GROUP_SECTION_RE.test(name.trim());
}

function countSectionSteps(section: MpdSection): number {
  return section.lines.filter((l) => l.trim() === "0 STEP").length;
}

/** 可作为搭建说明的 MPD 段（排除 SubModel Group 与零件库 .dat 段） */
function isMainInstructionSectionName(name: string): boolean {
  const trimmed = name.trim();
  if (isSubModelGroupSectionName(trimmed)) return false;
  if (/\.dat$/i.test(trimmed)) return false;
  return true;
}

/**
 * 无顶层 .io、且非主场景段上的 0 STEP 明显少于各 SubModel Group 合并步数时（如 MOC 223467），
 * 才用 Group 段拼主场景步骤；若存在步数充足的主场景段（如 238538-rivendell）则仍走主场景分步。
 */
function studioIoUsesSubModelGroupSectionsOnly(sections: MpdSection[]): boolean {
  if (sections.length < 2) return false;
  if (sections.some((s) => s.name.toLowerCase().endsWith(".io"))) return false;
  const groupSections = sections.filter((s) => isSubModelGroupSectionName(s.name));
  if (groupSections.length < 2) return false;

  const groupStepTotal = groupSections.reduce((n, s) => n + countSectionSteps(s), 0);
  let bestMainSceneSteps = 0;
  for (const s of sections) {
    if (!isMainInstructionSectionName(s.name)) continue;
    bestMainSceneSteps = Math.max(bestMainSceneSteps, countSectionSteps(s));
  }

  if (bestMainSceneSteps < 2) return true;
  return groupStepTotal > bestMainSceneSteps;
}

function collectStudioIoSubModelGroupPlacements(
  sections: MpdSection[],
  sectionByName: Map<string, MpdSection>,
  brickCatalog?: ReadonlyMap<number, StudioLxfmlBrick>
): StudioIoPlacement[] {
  const out: StudioIoPlacement[] = [];
  for (const s of sections) {
    if (!isSubModelGroupSectionName(s.name)) continue;
    out.push(
      ...expandPlacements(allPlacementsInSection(s, brickCatalog), sectionByName, brickCatalog)
    );
  }
  return out;
}

function buildMergedSubModelGroupSteps(
  sections: MpdSection[],
  sectionByName: Map<string, MpdSection>,
  brickCatalog?: ReadonlyMap<number, StudioLxfmlBrick>
): StudioIoMainStep[] {
  const merged: StudioIoMainStep[] = [];
  let nextIndex = 0;
  for (const s of sections) {
    if (!isSubModelGroupSectionName(s.name)) continue;
    const steps = buildMainSteps(s, sectionByName, brickCatalog);
    for (const st of steps) {
      const stepIndex = nextIndex++;
      merged.push({
        ...st,
        stepIndex,
        title: steps.length > 1 ? `${s.name} · ${st.title}` : st.title,
      });
    }
  }
  return merged;
}

function pickMainSection(sections: MpdSection[]): MpdSection {
  const main =
    sections.find((s) => s.name.toLowerCase().endsWith(".io")) ??
    sections.reduce(
      (best, s) => {
        const stepCount = s.lines.filter((l) => l.trim() === "0 STEP").length;
        return stepCount > best.stepCount ? { section: s, stepCount } : best;
      },
      { section: sections[0]!, stepCount: -1 }
    ).section;
  if (!main) {
    throw new Error("model.ldr 中无有效模型段。");
  }
  return main;
}

/** 将 model.lxfml BOM 砖块转为 placement（每块定义砖 1 片，与 Studio 零件清单同源）。 */
function studioLxfmlBomBricksToPlacements(bricks: readonly StudioLxfmlBrick[]): StudioIoPlacement[] {
  return bricks.map((brick) => ({
    partNum: brick.designId,
    ldrawColorId: 0,
    legoItemNo: brick.legoItemNo,
    brickRefId: brick.brickRefId,
    isSubmodelRef: false,
  }));
}

function studioPlacementPartColorKey(p: StudioIoPlacement): string {
  return `${legoMechanicalPartKey(normalizeStudioLdrawPartNum(p.partNum))}\t${normalizeStudioLdrawColorId(p.ldrawColorId)}`;
}

function needsSupplementFromLdrSteps(
  partNum: string,
  ldrawColorId: number,
  lxfmlBricks: readonly StudioLxfmlBrick[],
  elementLookup: StudioIoElementLookup | undefined,
  substituteClosure: ReadonlyMap<string, ReadonlySet<string>>
): boolean {
  if (lxfmlBricks.some((b) => legoMechanicalPartKeysEquivalent(b.designId, partNum))) {
    return false;
  }
  if (
    lxfmlBomCoversPlacementElement(
      partNum,
      ldrawColorId,
      lxfmlBricks,
      elementLookup,
      substituteClosure
    )
  ) {
    return false;
  }
  return true;
}

type SupplementLxfmlBomFromLdrOptions = {
  /**
   * 主场景 LDR 展开砖表。当 SubModel Group 分步远少于主场景时（如 238538），
   * 用主场景统计 lxfml 未登记的 design+色，避免只补到 Group 子集。
   */
  mainScenePlacements?: readonly StudioIoPlacement[];
  brickCatalog?: ReadonlyMap<number, StudioLxfmlBrick>;
  /** 与 `ParseStudioIoOptions.elementLookup` 相同，用于 brickRef 与 .dat 的 element_id 去重 */
  elementLookup?: StudioIoElementLookup;
  /**
   * 为 true（默认）时用主场景 LDR 补 lxfml 缺口；为 false 时仅在主场景片数多于分步时用主场景，否则用各步 per-part 最大值（SubModel Group 合步）。
   */
  supplementFromMainScene?: boolean;
};

function lxfmlBomItemNos(lxfmlBom: readonly StudioIoPlacement[]): Set<string> {
  const out = new Set<string>();
  for (const p of lxfmlBom) {
    const id = p.legoItemNo?.trim();
    if (id) out.add(id);
  }
  return out;
}

/**
 * LDR 砖行已计入 lxfml BOM 时不再补第二遍。
 * brickRef 的 itemNos 仅在 catalog design 与 .dat 一致，或与 .dat 在 elements 表为同一 element_id 时视为已收录；
 * Studio 常把 brickRef 指到无关 catalog 行（如 5852→3023），不能单凭 itemNos 跳过。
 */
function ldrPlacementAlreadyInLxfmlBom(
  p: StudioIoPlacement,
  lxfmlItemNos: ReadonlySet<string>,
  brickCatalog: ReadonlyMap<number, StudioLxfmlBrick> | undefined,
  elementLookup: StudioIoElementLookup | undefined,
  substituteClosure: ReadonlyMap<string, ReadonlySet<string>>
): boolean {
  const direct = p.legoItemNo?.trim();
  if (direct && lxfmlItemNos.has(direct)) return true;
  if (p.brickRefId == null || !brickCatalog) return false;
  const brick = brickCatalog.get(p.brickRefId);
  const item = brick?.legoItemNo?.trim();
  if (!brick || !item || !lxfmlItemNos.has(item)) return false;
  return catalogBrickRefRepresentsSameElementAsPlacement(
    p,
    brick,
    elementLookup,
    substituteClosure
  );
}

/**
 * Studio 有时在 model.lxfml 零件清单漏登记 design，但 model.ldr 仍有该 .dat。
 * 对 lxfml 未覆盖的 design+色：主场景充足时用主场景片数，否则用各 SubModel 分步最大值。
 */
function supplementLxfmlBomFromLdrSteps(
  lxfmlBom: readonly StudioIoPlacement[],
  mainSteps: readonly StudioIoMainStep[],
  lxfmlBricks: readonly StudioLxfmlBrick[],
  options?: SupplementLxfmlBomFromLdrOptions
): StudioIoPlacement[] {
  if (!lxfmlBom.length || !lxfmlBricks.length) return [...lxfmlBom];

  const lxfmlItemNos = lxfmlBomItemNos(lxfmlBom);
  const brickCatalog = options?.brickCatalog;
  const elementLookup = options?.elementLookup;
  const substituteClosure = buildPartSubstituteClosure(
    lxfmlBricks.map((b) => b.designId)
  );
  const stepPlacementCount = mainSteps.reduce((n, s) => n + s.newPlacements.length, 0);
  const mainScene = options?.mainScenePlacements;
  const supplementFromMainScene = options?.supplementFromMainScene ?? true;
  const useMainScene =
    mainScene != null &&
    mainScene.length > 0 &&
    (supplementFromMainScene || mainScene.length > stepPlacementCount);

  const qtyByPartColor = new Map<string, { placement: StudioIoPlacement; count: number }>();

  if (useMainScene) {
    for (const p of mainScene) {
      if (p.isSubmodelRef) continue;
      if (
        ldrPlacementAlreadyInLxfmlBom(
          p,
          lxfmlItemNos,
          brickCatalog,
          elementLookup,
          substituteClosure
        )
      ) {
        continue;
      }
      if (
        !needsSupplementFromLdrSteps(
          p.partNum,
          p.ldrawColorId,
          lxfmlBricks,
          elementLookup,
          substituteClosure
        )
      ) {
        continue;
      }
      const key = studioPlacementPartColorKey(p);
      const cur = qtyByPartColor.get(key);
      if (cur) cur.count += 1;
      else qtyByPartColor.set(key, { placement: p, count: 1 });
    }
  } else if (mainSteps.length > 0) {
    for (const step of mainSteps) {
      const stepCounts = new Map<string, { placement: StudioIoPlacement; count: number }>();
      for (const p of step.newPlacements) {
        if (p.isSubmodelRef) continue;
        if (
          ldrPlacementAlreadyInLxfmlBom(
            p,
            lxfmlItemNos,
            brickCatalog,
            elementLookup,
            substituteClosure
          )
        ) {
          continue;
        }
        if (
          !needsSupplementFromLdrSteps(
            p.partNum,
            p.ldrawColorId,
            lxfmlBricks,
            elementLookup,
            substituteClosure
          )
        ) {
        continue;
      }
        const key = studioPlacementPartColorKey(p);
        const cur = stepCounts.get(key);
        if (cur) cur.count += 1;
        else stepCounts.set(key, { placement: p, count: 1 });
      }
      for (const [key, entry] of stepCounts) {
        const prev = qtyByPartColor.get(key);
        if (!prev || entry.count > prev.count) qtyByPartColor.set(key, entry);
      }
    }
  }

  const extra: StudioIoPlacement[] = [];
  for (const { placement, count } of qtyByPartColor.values()) {
    for (let i = 0; i < count; i++) {
      extra.push({
        partNum: normalizeStudioLdrawPartNum(placement.partNum),
        ldrawColorId: placement.ldrawColorId,
        legoItemNo: null,
        brickRefId: placement.brickRefId,
        isSubmodelRef: false,
      });
    }
  }
  return [...lxfmlBom, ...extra];
}

export { pickStudioIoBomPlacements } from "@/lib/pick-studio-io-bom";

function allPlacementsInSection(
  section: MpdSection,
  brickCatalog?: ReadonlyMap<number, StudioLxfmlBrick>
): StudioIoPlacement[] {
  const out: StudioIoPlacement[] = [];
  for (const line of section.lines) {
    const p = parsePartLine(line, brickCatalog);
    if (p) out.push(p);
  }
  return out;
}

function expandPlacement(
  p: StudioIoPlacement,
  sectionByName: Map<string, MpdSection>,
  brickCatalog?: ReadonlyMap<number, StudioLxfmlBrick>
): StudioIoPlacement[] {
  if (!p.isSubmodelRef) return [p];
  const key = (p.submodelName ?? p.partNum).trim();
  const sec = findSection(sectionByName, key);
  if (!sec) return [p];
  return expandPlacements(allPlacementsInSection(sec, brickCatalog), sectionByName, brickCatalog);
}

function expandPlacements(
  placements: StudioIoPlacement[],
  sectionByName: Map<string, MpdSection>,
  brickCatalog?: ReadonlyMap<number, StudioLxfmlBrick>
): StudioIoPlacement[] {
  const out: StudioIoPlacement[] = [];
  for (const p of placements) {
    out.push(...expandPlacement(p, sectionByName, brickCatalog));
  }
  return out;
}

function splitMainLinesByStep(lines: string[]): {
  headerLines: string[];
  stepBlocks: { lines: string[] }[];
} {
  const headerLines: string[] = [];
  const stepBlocks: { lines: string[] }[] = [];
  let current: string[] = headerLines;
  for (const line of lines) {
    if (line.trim() === "0 STEP") {
      stepBlocks.push({ lines: [] });
      current = stepBlocks[stepBlocks.length - 1]!.lines;
      continue;
    }
    current.push(line);
  }
  return { headerLines, stepBlocks };
}

function buildMainSteps(
  main: MpdSection,
  sectionByName: Map<string, MpdSection>,
  brickCatalog?: ReadonlyMap<number, StudioLxfmlBrick>
): StudioIoMainStep[] {
  const { headerLines, stepBlocks } = splitMainLinesByStep(main.lines);
  const steps: StudioIoMainStep[] = [];

  const headerPlacements: StudioIoPlacement[] = [];
  for (const line of headerLines) {
    const p = parsePartLine(line, brickCatalog);
    if (p) headerPlacements.push(p);
  }
  if (headerPlacements.length > 0) {
    steps.push({
      stepIndex: 0,
      title: "基础层",
      description: null,
      newPlacements: expandPlacements(headerPlacements, sectionByName, brickCatalog),
    });
  }

  stepBlocks.forEach((block, i) => {
    const placements: StudioIoPlacement[] = [];
    let description: string | null = null;
    for (const line of block.lines) {
      if (line.startsWith("0 STUDIOSTEPDESC ")) {
        description = line.slice(17).trim() || null;
      }
      const p = parsePartLine(line, brickCatalog);
      if (p) placements.push(p);
    }
    const stepIndex = i + 1;
    steps.push({
      stepIndex,
      title: description ?? `步骤 ${stepIndex}`,
      description,
      newPlacements: expandPlacements(placements, sectionByName, brickCatalog),
    });
  });

  return steps;
}

/**
 * 解析 model.ldr 文本：主场景步骤；子模型引用展开为其内全部砖。
 */
export function parseStudioIoLdrText(
  ldrText: string,
  studioVersion: string | null = null,
  options?: ParseStudioIoOptions
): ParsedStudioIo {
  const brickCatalog = options?.brickCatalog;
  const lxfmlText = options?.lxfmlText;
  const elementLookup = options?.elementLookup;
  const normalized = normalizeStudioLdrText(ldrText);
  let sections = parseMpdSections(normalized);
  if (sections.length === 0) {
    sections = [{ name: "model.ldr", lines: normalized.split(/\r?\n/) }];
  }
  const sectionByName = buildSectionByName(sections);
  const main = pickMainSection(sections);

  let modelName = main.name;
  for (const line of main.lines) {
    if (line.startsWith("0 Name:")) {
      modelName = line.slice(7).trim() || modelName;
      break;
    }
  }

  const multiGroupOnly = studioIoUsesSubModelGroupSectionsOnly(sections);
  const mainScenePlacements = expandPlacements(
    allPlacementsInSection(main, brickCatalog),
    sectionByName,
    brickCatalog
  );
  let mainSteps = multiGroupOnly
    ? buildMergedSubModelGroupSteps(sections, sectionByName, brickCatalog)
    : buildMainSteps(main, sectionByName, brickCatalog);
  /** 全模 BOM 以 model.lxfml 零件清单为准；无 lxfml 时退回 LDR 展开 */
  const lxfmlBom = lxfmlText?.trim() ? parseStudioLxfmlBomBricks(lxfmlText) : [];
  let bomPlacements = lxfmlBom.length
    ? studioLxfmlBomBricksToPlacements(lxfmlBom)
    : multiGroupOnly
      ? collectStudioIoSubModelGroupPlacements(sections, sectionByName, brickCatalog)
      : mainScenePlacements;
  if (lxfmlBom.length) {
    bomPlacements = supplementLxfmlBomFromLdrSteps(bomPlacements, mainSteps, lxfmlBom, {
      mainScenePlacements,
      brickCatalog,
      elementLookup,
      supplementFromMainScene: !multiGroupOnly,
    });
  }

  if (mainSteps.length === 0) {
    if (bomPlacements.length === 0) {
      throw new Error("未找到主场景搭建步骤（无 0 STEP），且主场景无砖块行。");
    }
    mainSteps = [
      {
        stepIndex: 0,
        title: "整模",
        description: null,
        newPlacements: bomPlacements,
      },
    ];
  }

  return {
    modelName,
    studioVersion,
    mainSteps,
    bomPlacements,
    submodels: sections.filter((s) => s !== main).map((s) => s.name),
    brickCatalog: brickCatalog?.size ? brickCatalog : undefined,
  };
}
