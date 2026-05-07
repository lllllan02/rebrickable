import { describe, expect, it } from "vitest";

import {
  detectInventoryFormat,
  parseMocInventoryContent,
  parseMocInventoryCsv,
  parseMocInventoryJson,
} from "./moc-import-parse";

describe("parseMocInventoryCsv", () => {
  it("parses standard headers and merges duplicate keys", () => {
    const csv = `part_num,color_id,quantity
3001,0,2
3001,0,1
3020,1,4
`;
    const rows = parseMocInventoryCsv(csv);

    expect(rows).toEqual([
      { partNum: "3001", colorId: 0, quantity: 3, isSpare: false },
      { partNum: "3020", colorId: 1, quantity: 4, isSpare: false },
    ]);
  });

  it("accepts Rebrickable-style column names", () => {
    const csv = `Part,Color,Qty
2454,72,1
`;
    const rows = parseMocInventoryCsv(csv);

    expect(rows).toEqual([{ partNum: "2454", colorId: 72, quantity: 1, isSpare: false }]);
  });
});

describe("parseMocInventoryJson", () => {
  it("parses root array", () => {
    const json = JSON.stringify([
      { part_num: "3001", color_id: 0, quantity: 2 },
      { partNum: "3020", colorId: 1, qty: 1 },
    ]);
    const rows = parseMocInventoryJson(json);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ partNum: "3001", colorId: 0, quantity: 2 });
    expect(rows[1]).toMatchObject({ partNum: "3020", colorId: 1, quantity: 1 });
  });

  it("parses parts wrapper", () => {
    const json = JSON.stringify({
      parts: [{ partNum: "3001", colorId: 0, quantity: 1 }],
    });
    const rows = parseMocInventoryJson(json);

    expect(rows).toEqual([{ partNum: "3001", colorId: 0, quantity: 1, isSpare: false }]);
  });
});

describe("detectInventoryFormat", () => {
  it("uses extension when present", () => {
    expect(detectInventoryFormat("x.csv", "{")).toBe("csv");
    expect(detectInventoryFormat("x.json", "a,b,c")).toBe("json");
  });

  it("sniffs json from content", () => {
    expect(detectInventoryFormat("unknown", '[{"partNum":"1"}]')).toBe("json");
  });
});

describe("parseMocInventoryContent", () => {
  it("dispatches by format", () => {
    const csv = "part_num,color_id,quantity\n1,0,1\n";
    const rows = parseMocInventoryContent(csv, "csv");

    expect(rows[0]?.partNum).toBe("1");
  });
});
