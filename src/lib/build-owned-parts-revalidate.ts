import { revalidatePath } from "next/cache";

export function revalidateOwnedPartsPaths(partNums?: readonly string[]): void {
  revalidatePath("/parts/owned");
  revalidatePath("/parts");
  if (partNums) {
    for (const partNum of partNums) {
      if (!partNum.trim()) continue;
      revalidatePath(`/parts/${encodeURIComponent(partNum.trim())}`);
    }
  }
}
