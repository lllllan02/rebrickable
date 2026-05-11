export const MOC_PROFILE_MAX_DISPLAY_NAME = 120;
export const MOC_PROFILE_MAX_TAGS = 24;
export const MOC_PROFILE_MAX_TAG_LEN = 40;

export function parseTagsJson(raw: string | null | undefined): string[] {
  if (raw === null || raw === undefined || raw.trim() === "") return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

/** 去空、截断、按小写去重（保留先出现的写法） */
export function normalizeMocTags(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (let t of raw) {
    t = t.trim();
    if (!t) continue;
    if (t.length > MOC_PROFILE_MAX_TAG_LEN) t = t.slice(0, MOC_PROFILE_MAX_TAG_LEN);
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= MOC_PROFILE_MAX_TAGS) break;
  }
  return out;
}

export function serializeTagsJson(tags: string[]): string {
  return JSON.stringify(normalizeMocTags(tags));
}
