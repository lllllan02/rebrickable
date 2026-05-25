import { revalidatePath } from "next/cache";

export function revalidateSetGoodPricePaths(_setNum?: string): void {
  revalidatePath("/sets/prices");
}
