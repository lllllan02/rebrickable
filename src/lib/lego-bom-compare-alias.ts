import {
  bomMechColorKey,
  bomPartColorKey,
  normalizeLdrawPartToken,
} from "@/lib/lego-bom-compare-keys";
import {
  legoMechanicalPartKey,
  legoMechanicalPartKeysEquivalent,
} from "@/lib/lego-mechanical-part-key";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

/**
 * 印刷件对照键：3070pb092 与 3070bpb092 等（pb / bpb / pr + 图案编号）归一为同一键。
 */
function legoPrintedDecorCompareKey(partNum: string): string | null {
  const m = /^(\d{1,6})([a-z]*?)(?:pb|bpb|pr)([a-z0-9]+)$/i.exec(partNum.trim());
  if (!m) return null;
  const baseMech = legoMechanicalPartKey(`${m[1] ?? ""}${m[2] ?? ""}`);
  const decor = (m[3] ?? "").toLowerCase();
  if (!baseMech || !decor) return null;
  return `print:${baseMech}:${decor}`;
}

export type LegoBomAliasOptions = {
  /** `part_relationships` A/M 连通分量内的其它 part_num */
  substitutePartNums?: readonly string[];
};

/** 用于 IO 行对齐 MOC 行的全部别名键（element / part+色 / 机械规格 / LDraw / 印刷 / 替代件）。 */
export function legoBomAliasKeys(
  item: ShortageResolveItem,
  options?: LegoBomAliasOptions
): string[] {
  const colorId = Math.trunc(item.colorId);
  if (!Number.isFinite(colorId) || colorId < 0) return [];

  const partNums = new Set<string>();
  const addPart = (raw: string) => {
    const t = raw.trim();
    if (t) partNums.add(t);
  };
  addPart(item.partNum);
  for (const sub of options?.substitutePartNums ?? []) addPart(sub);

  const keys: string[] = [];
  const eid = item.elementId?.trim();
  if (eid) keys.push(`e:${eid}`);

  for (const partNum of partNums) {
    keys.push(`p:${bomPartColorKey(partNum, colorId)}`);
    keys.push(`m:${bomMechColorKey(partNum, colorId)}`);
    const decor = legoPrintedDecorCompareKey(partNum);
    if (decor) keys.push(`d:${decor}\t${colorId}`);
  }

  const token = normalizeLdrawPartToken(item.partNum, item.ldrawPartNum);
  keys.push(`l:${token}\t${colorId}`);

  return [...new Set(keys)];
}

/** 两零件号是否可视为同件（机械规格或 part_relationships A/M 替代）。 */
export function partNumsCanPairViaSubstitute(
  a: string,
  b: string,
  substituteClosure: ReadonlyMap<string, ReadonlySet<string>>
): boolean {
  const at = a.trim().toLowerCase();
  const bt = b.trim().toLowerCase();
  if (!at || !bt) return false;
  if (at === bt) return true;
  if (legoMechanicalPartKeysEquivalent(a, b)) return true;
  const ga = substituteClosure.get(at);
  if (ga?.has(bt)) return true;
  const gb = substituteClosure.get(bt);
  if (gb?.has(at)) return true;
  return false;
}

export function substitutePartNumsForItem(
  partNum: string,
  substituteClosure: ReadonlyMap<string, ReadonlySet<string>> | undefined
): string[] {
  const key = partNum.trim().toLowerCase();
  const group = substituteClosure?.get(key);
  if (!group) return [];
  return [...group].filter((p) => p.toLowerCase() !== key);
}
