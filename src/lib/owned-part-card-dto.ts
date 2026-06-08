export type OwnedPartCardDto = {
  partNum: string;
  colorId: number;
  colorName: string;
  quantity: number;
  name: string;
  thumb: string | null;
  isPrinted: boolean;
};

export function ownedPartCardKey(partNum: string, colorId: number): string {
  return `${partNum}\0${colorId}`;
}
