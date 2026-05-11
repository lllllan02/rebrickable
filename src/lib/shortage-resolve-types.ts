export type ShortageResolveItem = {
  lineNumber: number;
  partNum: string;
  colorId: number;
  quantity: number;
  rest: string;
  partFound: boolean;
  partName: string | null;
  colorName: string | null;
  elementKnown: boolean;
  imgUrl: string | null;
  imgSource: "color" | "part" | null;
};
