import { legoMechanicalPartKeysEquivalent } from "@/lib/lego-mechanical-part-key";
import type { StudioLxfmlBrick } from "@/lib/parse-studio-lxfml";

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
      return { partNum: fileToken.replace(/\.dat$/i, ""), ldrawColorId: rawColor, isSubmodelRef: false };
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
          partNum: fileToken.replace(/\.dat$/i, ""),
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

function parseMpdSections(ldrText: string): MpdSection[] {
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
  return (
    sectionByName.get(key) ??
    sectionByName.get(key.toLowerCase()) ??
    [...sectionByName.entries()].find(([n]) => n.toLowerCase() === key.toLowerCase())?.[1]
  );
}

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
  const normalized = normalizeStudioLdrText(ldrText);
  let sections = parseMpdSections(normalized);
  if (sections.length === 0) {
    sections = [{ name: "model.ldr", lines: normalized.split(/\r?\n/) }];
  }
  const sectionByName = new Map<string, MpdSection>();
  for (const s of sections) {
    sectionByName.set(s.name, s);
    sectionByName.set(s.name.toLowerCase(), s);
  }

  const main =
    sections.find((s) => s.name.toLowerCase().endsWith(".io")) ??
    sections.reduce(
      (best, s) => {
        const stepCount = s.lines.filter((l) => l.trim() === "0 STEP").length;
        return stepCount > best.stepCount ? { section: s, stepCount } : best;
      },
      { section: sections[0], stepCount: -1 }
    ).section;
  if (!main) {
    throw new Error("model.ldr 中无有效模型段。");
  }

  let modelName = main.name;
  for (const line of main.lines) {
    if (line.startsWith("0 Name:")) {
      modelName = line.slice(7).trim() || modelName;
      break;
    }
  }

  const mainSteps = buildMainSteps(main, sectionByName, brickCatalog);
  if (mainSteps.length === 0) {
    throw new Error("未找到主场景搭建步骤（无 0 STEP）。");
  }

  return {
    modelName,
    studioVersion,
    mainSteps,
    submodels: sections.filter((s) => s !== main).map((s) => s.name),
    brickCatalog: brickCatalog?.size ? brickCatalog : undefined,
  };
}
