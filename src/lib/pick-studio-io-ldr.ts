import fs from "fs/promises";
import path from "path";

import { normalizeStudioLdrText, parseMpdSections } from "@/lib/parse-studio-io";

const LDR_CANDIDATES = ["modelv2.ldr", "model2.ldr", "model.ldr", "modelv1.ldr"] as const;

type LdrCandidate = {
  name: (typeof LDR_CANDIDATES)[number];
  text: string;
  stepCount: number;
  partLineCount: number;
};

function analyzeLdrText(text: string): { stepCount: number; partLineCount: number } {
  let stepCount = 0;
  let partLineCount = 0;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "0 STEP") stepCount++;
    const parts = trimmed.split(/\s+/);
    const t = parts[0];
    if (t === "1" || t === "10" || t === "11") partLineCount++;
  }
  return { stepCount, partLineCount };
}

/** model2.ldr 有时是「按零件 FILE 切段」的零件库 MPD，无法当搭建步骤解析，应退回 model.ldr。 */
function model2IsInstructionFriendlyMpd(text: string): boolean {
  const sections = parseMpdSections(normalizeStudioLdrText(text));
  if (sections.length <= 1) return true;
  if (sections.some((s) => s.name.toLowerCase().endsWith(".io"))) return true;

  const datSections = sections.filter((s) => /\.dat$/i.test(s.name.trim()));
  if (datSections.length / sections.length >= 0.5) return false;

  return sections.some(
    (s) => !/\.dat$/i.test(s.name.trim()) && !s.name.trim().toLowerCase().startsWith("s/")
  );
}

/**
 * 从解压目录选取最合适的 LDR：优先 modelv2；旧版 Studio 在 model2.ldr 中内联子模型且步骤数一致时优先 model2。
 */
export async function readStudioIoLdrFromExtractDir(
  extractDir: string
): Promise<{ name: string; text: string }> {
  const loaded: LdrCandidate[] = [];
  for (const name of LDR_CANDIDATES) {
    const filePath = path.join(extractDir, name);
    try {
      const text = await fs.readFile(filePath, "utf8");
      const { stepCount, partLineCount } = analyzeLdrText(text);
      loaded.push({ name, text, stepCount, partLineCount });
    } catch {
      /* missing */
    }
  }
  if (loaded.length === 0) {
    throw new Error("解压后未找到 model.ldr / modelv2.ldr / model2.ldr。");
  }

  const byName = new Map(loaded.map((c) => [c.name, c]));
  const v2 = byName.get("modelv2.ldr");
  if (v2) return { name: v2.name, text: v2.text };

  const model = byName.get("model.ldr");
  /** 旧版单文件 model.ldr（无 0 FILE）比空的 Erebor.io 段 model2 更可靠 */
  if (model && parseMpdSections(normalizeStudioLdrText(model.text)).length === 0) {
    return { name: model.name, text: model.text };
  }

  const model2 = byName.get("model2.ldr");
  if (model2 && model) {
    const moreParts = model2.partLineCount > model.partLineCount;
    const stepsOk = model2.stepCount >= model.stepCount;
    if (moreParts && stepsOk && model2IsInstructionFriendlyMpd(model2.text)) {
      return { name: model2.name, text: model2.text };
    }
  }

  for (const name of ["model.ldr", "modelv1.ldr", "model2.ldr"] as const) {
    const hit = byName.get(name);
    if (hit) return { name: hit.name, text: hit.text };
  }
  const first = loaded[0]!;
  return { name: first.name, text: first.text };
}
