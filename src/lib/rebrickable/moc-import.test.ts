import { describe, expect, it } from "vitest";

import { filterMocInventory, parseMocInventoryCsv } from "./moc-import";

describe("moc inventory import", () => {
  it("parses Rebrickable-style csv rows", () => {
    const result = parseMocInventoryCsv(
      [
        "part_num,part_name,color_id,quantity,is_spare",
        '"3001","Brick 2 x 4","5","2","false"',
      ].join("\n"),
    );

    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      {
        partNum: "3001",
        partName: "Brick 2 x 4",
        colorId: 5,
        quantity: 2,
        isSpare: false,
        colorName: undefined,
        elementId: undefined,
      },
    ]);
  });

  it("keeps exact colors, substitutes same-part colors, and rejects missing parts", () => {
    const result = filterMocInventory(
      [
        { partNum: "3001", colorId: 5, quantity: 2, isSpare: false },
        { partNum: "3002", colorId: 99, quantity: 1, isSpare: false },
        { partNum: "9999", colorId: 1, quantity: 1, isSpare: false },
      ],
      [
        { partNum: "3001", colorId: 5 },
        { partNum: "3002", colorId: 1 },
        { partNum: "3002", colorId: 4 },
      ],
    );

    expect(result.filtered).toMatchObject([
      { partNum: "3001", colorId: 5, status: "kept" },
      { partNum: "3002", colorId: 1, sourceColorId: 99, status: "color_replaced" },
    ]);
    expect(result.rejected).toMatchObject([{ partNum: "9999", reason: expect.any(String) }]);
  });
});
