import { revalidatePath } from "next/cache";

export function revalidatePartGroupPaths(partNums?: readonly string[]): void {
  revalidatePath("/parts");
  revalidatePath("/parts/favorites");
  revalidatePath("/parts/owned");
  revalidatePath("/parts/purchase");
  if (partNums) {
    for (const partNum of partNums) {
      if (!partNum.trim()) continue;
      revalidatePath(`/parts/${encodeURIComponent(partNum.trim())}`);
    }
  }
}
