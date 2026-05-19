import { legoMechanicalPartKey } from "@/lib/lego-mechanical-part-key";

/** Studio LdrawId / .io 中 .dat 文件名（无后缀、小写） */
export function normalizeLdrawPartToken(
  partNum: string,
  ldrawPartNum?: string | null
): string {
  return (ldrawPartNum ?? partNum).trim().toLowerCase().replace(/\.dat$/i, "");
}

export function bomPartColorKey(partNum: string, colorId: number): string {
  return `${partNum.trim().toLowerCase()}\t${Math.trunc(colorId)}`;
}

export function bomMechColorKey(partNum: string, colorId: number): string {
  return `${legoMechanicalPartKey(partNum)}\t${Math.trunc(colorId)}`;
}
