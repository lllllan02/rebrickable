import { revalidatePath } from "next/cache";

export function revalidateFavoritePartsPaths(partNums?: readonly string[]): void {
  revalidatePath("/parts/favorites");
  revalidatePath("/parts");
  if (partNums) {
    for (const partNum of partNums) {
      if (!partNum.trim()) continue;
      revalidatePath(`/parts/${encodeURIComponent(partNum.trim())}`);
    }
  }
}
