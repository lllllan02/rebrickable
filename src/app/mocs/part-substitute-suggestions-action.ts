"use server";

import { fetchPartSubstituteSuggestions } from "@/lib/part-substitute-suggestions-server";
import type { PartSubstituteSuggestion } from "@/lib/part-substitute-suggestions-server";

export type { PartSubstituteSuggestion };

export async function getPartSubstituteSuggestionsAction(
  partNumRaw: string
): Promise<{ ok: true; items: PartSubstituteSuggestion[] } | { ok: false; error: string }> {
  try {
    const items = await fetchPartSubstituteSuggestions(partNumRaw);
    return { ok: true, items };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "加载推荐替换失败";
    return { ok: false, error: msg };
  }
}
