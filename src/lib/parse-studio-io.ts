/** BrickLink Studio .io 固定 ZIP 密码（公开约定） */
export const STUDIO_IO_ZIP_PASSWORD = "soho0909";

export type StudioIoPlacement = {
  partNum: string;
  ldrawColorId: number;
  /** 来自子模型引用且未能展开 */
  isSubmodelRef: boolean;
  submodelName?: string;
};

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
};

/** LDraw type-1/10：color + xyz + 3×3 矩阵共 13 个字段后即为零件/子模型文件名（可含空格）。 */
const LDRAW_PART_FILENAME_START = 14;

function parsePartLine(line: string): StudioIoPlacement | null {
  const parts = line.trim().split(/\s+/);
  if (!parts.length || (parts[0] !== "1" && parts[0] !== "10")) return null;
  if (parts.length < LDRAW_PART_FILENAME_START + 1) return null;
  const color = Number.parseInt(parts[1] ?? "", 10);
  if (!Number.isFinite(color)) return null;
  const fileToken = parts.slice(LDRAW_PART_FILENAME_START).join(" ").trim();
  if (!fileToken) return null;
  const isDat = fileToken.toLowerCase().endsWith(".dat");
  if (isDat) {
    return { partNum: fileToken.replace(/\.dat$/i, ""), ldrawColorId: color, isSubmodelRef: false };
  }
  return {
    partNum: fileToken,
    ldrawColorId: color,
    isSubmodelRef: true,
    submodelName: fileToken,
  };
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

function allPlacementsInSection(section: MpdSection): StudioIoPlacement[] {
  const out: StudioIoPlacement[] = [];
  for (const line of section.lines) {
    const p = parsePartLine(line);
    if (p) out.push(p);
  }
  return out;
}

function expandPlacement(
  p: StudioIoPlacement,
  sectionByName: Map<string, MpdSection>
): StudioIoPlacement[] {
  if (!p.isSubmodelRef) return [p];
  const key = (p.submodelName ?? p.partNum).trim();
  const sec = findSection(sectionByName, key);
  if (!sec) return [p];
  return expandPlacements(allPlacementsInSection(sec), sectionByName);
}

function expandPlacements(
  placements: StudioIoPlacement[],
  sectionByName: Map<string, MpdSection>
): StudioIoPlacement[] {
  const out: StudioIoPlacement[] = [];
  for (const p of placements) {
    out.push(...expandPlacement(p, sectionByName));
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

function buildMainSteps(main: MpdSection, sectionByName: Map<string, MpdSection>): StudioIoMainStep[] {
  const { headerLines, stepBlocks } = splitMainLinesByStep(main.lines);
  const steps: StudioIoMainStep[] = [];

  const headerPlacements: StudioIoPlacement[] = [];
  for (const line of headerLines) {
    const p = parsePartLine(line);
    if (p) headerPlacements.push(p);
  }
  if (headerPlacements.length > 0) {
    steps.push({
      stepIndex: 0,
      title: "基础层",
      description: null,
      newPlacements: expandPlacements(headerPlacements, sectionByName),
    });
  }

  stepBlocks.forEach((block, i) => {
    const placements: StudioIoPlacement[] = [];
    let description: string | null = null;
    for (const line of block.lines) {
      if (line.startsWith("0 STUDIOSTEPDESC ")) {
        description = line.slice(17).trim() || null;
      }
      const p = parsePartLine(line);
      if (p) placements.push(p);
    }
    const stepIndex = i + 1;
    steps.push({
      stepIndex,
      title: description ?? `步骤 ${stepIndex}`,
      description,
      newPlacements: expandPlacements(placements, sectionByName),
    });
  });

  return steps;
}

/**
 * 解析 model.ldr 文本：主场景步骤；子模型引用展开为其内全部砖。
 */
export function parseStudioIoLdrText(ldrText: string, studioVersion: string | null = null): ParsedStudioIo {
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

  const mainSteps = buildMainSteps(main, sectionByName);
  if (mainSteps.length === 0) {
    throw new Error("未找到主场景搭建步骤（无 0 STEP）。");
  }

  return {
    modelName,
    studioVersion,
    mainSteps,
    submodels: sections.filter((s) => s !== main).map((s) => s.name),
  };
}
