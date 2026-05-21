/** 由官方套装改编的 MOC：ID 为 `{setNum}-001`、`-002` … */

const DERIVATION_SUFFIX_RE = /^(\d{3})$/;

export function formatMocIdFromSetDerivation(setNum: string, sequence: number): string {
  const set = setNum.trim();
  const n = Math.max(1, Math.floor(sequence));
  if (!set) throw new Error("setNum 为空");
  if (n > 999) throw new Error("改编序号超过 999");
  return `${set}-${String(n).padStart(3, "0")}`;
}

/** 若 `mocId` 为 `{setNum}-NNN` 则返回 NNN，否则 null */
export function parseMocDerivationSequence(setNum: string, mocId: string): number | null {
  const set = setNum.trim();
  const id = mocId.trim();
  if (!set || !id) return null;
  const prefix = `${set}-`;
  if (!id.startsWith(prefix)) return null;
  const tail = id.slice(prefix.length);
  const m = DERIVATION_SUFFIX_RE.exec(tail);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

export function nextMocDerivationSequence(setNum: string, existingMocIds: Iterable<string>): number {
  let max = 0;
  for (const id of existingMocIds) {
    const seq = parseMocDerivationSequence(setNum, id);
    if (seq != null && seq > max) max = seq;
  }
  return max + 1;
}
