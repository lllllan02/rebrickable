/**
 * MOC 238538：.io 解析结果 vs Studio 2.0 零件清单 CSV
 * 用法: npx tsx scripts/compare-io-238538.ts
 */
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

import Database from "better-sqlite3";
import { parse } from "csv-parse/sync";

import { parseStudioLxfmlBrickCatalog } from "../src/lib/parse-studio-lxfml";
import {
  parseStudioIoLdrText,
  pickStudioIoBomPlacements,
  STUDIO_IO_ZIP_PASSWORD,
} from "../src/lib/parse-studio-io";
import {
  enrichStudioIoPlacementsWithItemNos,
  studioLdrawColorAliases,
} from "../src/lib/studio-io-item-lookup";
import {
  legoMechanicalPartKey,
  legoMechanicalPartKeysEquivalent,
} from "../src/lib/lego-mechanical-part-key";

const IO_PATH =
  "data/build-uploads/moc/238538/dcb9a058-2068-49f1-9b81-08dcc701ca27.io";
const CSV_PATH = "MOC 238538 Rivendell.csv";
const DB_PATH = "data/rebrickable.db";

type AggRow = { partNum: string; colorId: number; elementId: string | null; qty: number };

function loadIo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rb-cmp-"));
  execFileSync("unzip", ["-P", STUDIO_IO_ZIP_PASSWORD, "-oq", IO_PATH, "-d", tmp]);
  const lxfml = fs.readFileSync(path.join(tmp, "model.lxfml"), "utf8");
  const catalog = parseStudioLxfmlBrickCatalog(lxfml);
  const ldr = fs.readFileSync(path.join(tmp, "modelv2.ldr"), "utf8");
  const parsed = parseStudioIoLdrText(ldr, null, {
    brickCatalog: catalog.size ? catalog : undefined,
  });
  return { placements: pickStudioIoBomPlacements(parsed), catalog };
}

function elementColorByItemNos(itemNos: string[]): Map<string, { colorId: number }> {
  const db = new Database(DB_PATH, { readonly: true });
  const out = new Map<string, { colorId: number }>();
  const uniq = [...new Set(itemNos.filter(Boolean))];
  const CHUNK = 400;
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const slice = uniq.slice(i, i + CHUNK);
    const placeholders = slice.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT element_id AS elementId, color_id AS colorId FROM elements WHERE element_id IN (${placeholders})`)
      .all(...slice) as { elementId: string; colorId: number }[];
    for (const r of rows) out.set(r.elementId, { colorId: r.colorId });
  }
  db.close();
  return out;
}

function elementIdentityByItemNos(
  itemNos: string[]
): Map<string, { partNum: string; colorId: number }> {
  const db = new Database(DB_PATH, { readonly: true });
  const out = new Map<string, { partNum: string; colorId: number }>();
  const uniq = [...new Set(itemNos.filter(Boolean))];
  const CHUNK = 400;
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const slice = uniq.slice(i, i + CHUNK);
    const placeholders = slice.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT element_id AS elementId, part_num AS partNum, color_id AS colorId FROM elements WHERE element_id IN (${placeholders})`
      )
      .all(...slice) as { elementId: string; partNum: string; colorId: number }[];
    for (const r of rows) out.set(r.elementId, { partNum: r.partNum, colorId: r.colorId });
  }
  db.close();
  return out;
}

function inferElementId(
  partNum: string,
  ldrawColorId: number,
  catalog: ReturnType<typeof loadIo>["catalog"],
  catalogItemNos: Set<string>,
  db: Database.Database
): string | null {
  const mech = legoMechanicalPartKey(partNum);
  const parts = [...new Set([partNum, mech, `${mech}a`, `${mech}b`])];
  const colors = studioLdrawColorAliases(ldrawColorId);
  const ph = parts.map(() => "?").join(",");
  const ch = colors.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT element_id AS elementId FROM elements WHERE part_num IN (${ph}) AND color_id IN (${ch}) ORDER BY element_id`
    )
    .all(...parts, ...colors) as { elementId: string }[];
  if (rows.length === 0) return null;
  const preferred = rows.filter((r) => catalogItemNos.has(r.elementId));
  if (preferred.length >= 1) return preferred[0]!.elementId;
  const designInLxfml = [...catalog.values()].some((b) =>
    legoMechanicalPartKeysEquivalent(b.designId, partNum)
  );
  if (rows.length === 1 && designInLxfml) return rows[0]!.elementId;
  return null;
}

function aggregateIoRows(
  placements: ReturnType<typeof loadIo>["placements"],
  catalog: ReturnType<typeof loadIo>["catalog"]
): AggRow[] {
  const itemNos = [...catalog.values()].map((b) => b.legoItemNo);
  const elementColors = elementColorByItemNos(itemNos);
  const catalogItemNos = new Set([...catalog.values()].map((b) => b.legoItemNo));
  let enriched = enrichStudioIoPlacementsWithItemNos(placements, catalog, elementColors);
  const db = new Database(DB_PATH, { readonly: true });
  enriched = enriched.map((p) => {
    if (p.legoItemNo?.trim() || p.isSubmodelRef) return p;
    const inferred = inferElementId(p.partNum, p.ldrawColorId, catalog, catalogItemNos, db);
    return inferred ? { ...p, legoItemNo: inferred } : p;
  });
  db.close();
  const byItem = elementIdentityByItemNos(
    enriched.map((p) => p.legoItemNo?.trim() ?? "").filter(Boolean)
  );

  const map = new Map<string, AggRow>();
  for (const p of enriched) {
    const item = p.legoItemNo?.trim() || null;
    const hit = item ? byItem.get(item) : undefined;
    const partNum = hit?.partNum ?? legoMechanicalPartKey(p.partNum);
    const colorId = hit?.colorId ?? p.ldrawColorId;
    const key = item ? `item:${item}` : `${partNum}\t${colorId}`;
    const cur = map.get(key);
    if (cur) cur.qty += 1;
    else map.set(key, { partNum, colorId, elementId: item, qty: 1 });
  }
  return [...map.values()];
}

function loadCsvAgg(): Map<string, AggRow> {
  const csvRows = parse(fs.readFileSync(CSV_PATH, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];
  const map = new Map<string, AggRow>();
  for (const r of csvRows) {
    const partNum = (r.BLItemNo ?? "").trim();
    if (!partNum || /^total/i.test(partNum)) continue;
    const qty = Number.parseInt(r.Qty ?? "", 10);
    if (!Number.isFinite(qty) || qty < 1) continue;
    const colorId = Number.parseInt(r.LDrawColorId ?? "", 10);
    const elementId = (r.ElementId ?? "").trim() || null;
    const key = elementId ? `item:${elementId}` : `${partNum}\t${colorId}`;
    const cur = map.get(key);
    if (cur) cur.qty += qty;
    else map.set(key, { partNum, colorId, elementId, qty });
  }
  return map;
}

function main() {
  const { placements, catalog } = loadIo();
  const ioRows = aggregateIoRows(placements, catalog);
  const csvMap = loadCsvAgg();

  const ioMap = new Map<string, number>();
  for (const r of ioRows) {
    const key = r.elementId ? `item:${r.elementId}` : `${r.partNum}\t${r.colorId}`;
    ioMap.set(key, (ioMap.get(key) ?? 0) + r.qty);
  }

  let onlyIo = 0;
  let onlyCsv = 0;
  let mismatch = 0;
  const onlyIoSamples: string[] = [];
  const onlyCsvSamples: string[] = [];
  const mismatchSamples: string[] = [];

  for (const [k, v] of ioMap) {
    const csvQ = csvMap.get(k)?.qty;
    if (csvQ == null) {
      onlyIo++;
      if (onlyIoSamples.length < 10) onlyIoSamples.push(`${k} qty=${v}`);
    } else if (csvQ !== v) {
      mismatch++;
      if (mismatchSamples.length < 10) mismatchSamples.push(`${k} io=${v} csv=${csvQ}`);
    }
  }
  for (const [k, v] of csvMap) {
    if (!ioMap.has(k)) {
      onlyCsv++;
      if (onlyCsvSamples.length < 10) {
        onlyCsvSamples.push(`${k} csv qty=${v.qty} part=${v.partNum}`);
      }
    }
  }

  const ioTotal = [...ioMap.values()].reduce((a, b) => a + b, 0);
  const csvTotal = [...csvMap.values()].reduce((a, b) => a + b.qty, 0);

  console.log({
    rawPlacements: placements.length,
    ioLines: ioMap.size,
    csvLines: csvMap.size,
    ioTotal,
    csvTotal,
    onlyIo,
    onlyCsv,
    mismatch,
  });
  if (onlyIoSamples.length) console.log("\nOnly IO:", onlyIoSamples);
  if (onlyCsvSamples.length) console.log("\nOnly CSV:", onlyCsvSamples);
  if (mismatchSamples.length) console.log("\nQty mismatch:", mismatchSamples);

  if (onlyIo === 0 && onlyCsv === 0 && mismatch === 0) {
    console.log("\n✓ IO 解析与 Studio CSV 完全一致");
  } else {
    process.exitCode = 1;
  }
}

main();
