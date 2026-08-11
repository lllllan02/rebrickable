import { revalidatePath } from "next/cache";

export function revalidatePurchaseListPaths(partNums?: readonly string[]): void {
  revalidatePath("/parts/purchase");
  revalidatePath("/parts");
  revalidatePath("/parts/favorites");
  revalidatePath("/parts/owned");
  if (partNums) {
    for (const partNum of partNums) {
      if (!partNum.trim()) continue;
      revalidatePath(`/parts/${encodeURIComponent(partNum.trim())}`);
    }
  }
}
