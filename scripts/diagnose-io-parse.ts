/**
 * Studio .io 解析诊断与 BOM 对照
 *
 * 扫描模式（默认）:
 *   npx tsx scripts/diagnose-io-parse.ts [mocId]
 *
 * 与 Studio CSV 对照:
 *   npx tsx scripts/diagnose-io-parse.ts --compare [--io <path>] [--csv <path>] [--db <path>]
 *   （省略路径时使用 MOC 238538 默认样本）
 */
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { readdirSync } from "fs";

import Database from "better-sqlite3";
import { parse } from "csv-parse/sync";

import { readStudioIoLdrFromExtractDir } from "../src/lib/pick-studio-io-ldr";
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

const DEFAULT_COMPARE_IO =
  "data/build-uploads/moc/238538/dcb9a058-2068-49f1-9b81-08dcc701ca27.io";
const DEFAULT_COMPARE_CSV = "MOC 238538 Rivendell.csv";
const DEFAULT_DB_PATH = "data/rebrickable.db";

function readArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return undefined;
  const v = process.argv[i + 1]?.trim();
  return v || undefined;
}

async function diagnoseIo(ioPath: string) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rb-diag-"));
  execFileSync("unzip", ["-P", STUDIO_IO_ZIP_PASSWORD, "-oq", ioPath, "-d", tmp]);

  let catalog: ReturnType<typeof parseStudioLxfmlBrickCatalog> | undefined;
  let lxfmlText: string | undefined;
  try {
    lxfmlText = fs.readFileSync(path.join(tmp, "model.lxfml"), "utf8");
    catalog = parseStudioLxfmlBrickCatalog(lxfmlText);
  } catch {
    catalog = undefined;
    lxfmlText = undefined;
  }

  let ldrName: string;
  let ldr: string;
  try {
    const picked = await readStudioIoLdrFromExtractDir(tmp);
    ldrName = picked.name;
    ldr = picked.text;
  } catch {
    fs.rmSync(tmp, { recursive: true, force: true });
    return { ioPath, error: "no ldr" };
  }

  const typeLines = ldr.split(/\r?\n/).filter((l) => /^(1|10|11)\s/.test(l.trim()));
  const stepCount = ldr.split(/\r?\n/).filter((l) => l.trim() === "0 STEP").length;

  let parsed;
  try {
    parsed = parseStudioIoLdrText(ldr, null, {
      brickCatalog: catalog?.size ? catalog : undefined,
      lxfmlText,
    });
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    return {
      ioPath,
      ldrName,
      catalogSize: catalog?.size ?? 0,
      rawTypeLines: typeLines.length,
      stepCount,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const stepPlacements = parsed.mainSteps.flatMap((s) => s.newPlacements);
  const bomPlacements = pickStudioIoBomPlacements(parsed);
  const withItemNo = bomPlacements.filter((p) => p.legoItemNo?.trim()).length;
  const submodelRefs = bomPlacements.filter((p) => p.isSubmodelRef).length;

  fs.rmSync(tmp, { recursive: true, force: true });

  return {
    ioPath: ioPath.replace(/.*build-uploads\//, ""),
    ldrName,
    catalogSize: catalog?.size ?? 0,
    rawTypeLines: typeLines.length,
    stepCount,
    parsedSteps: parsed.mainSteps.length,
    stepPlacements: stepPlacements.length,
    bomPlacements: bomPlacements.length,
    withItemNo,
    submodelRefs,
    bomVsLdr: bomPlacements.length - typeLines.length,
  };
}

async function runScanMode() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const mocFilter = args[0];
  const base = path.join("data/build-uploads/moc");
  const mocDirs = mocFilter
    ? [path.join(base, mocFilter)]
    : readdirSync(base, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => path.join(base, d.name));
  const files = mocDirs
    .flatMap((dir) =>
      fs.existsSync(dir)
        ? readdirSync(dir)
            .filter((f) => f.endsWith(".io"))
            .map((f) => path.join(dir, f))
        : []
    )
    .sort();
  for (const f of files) {
    console.log(JSON.stringify(await diagnoseIo(f)));
  }
}

type AggRow = { partNum: string; colorId: number; elementId: string | null; qty: number };

function loadIoFromPath(ioPath: string) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rb-cmp-"));
  execFileSync("unzip", ["-P", STUDIO_IO_ZIP_PASSWORD, "-oq", ioPath, "-d", tmp]);
  const lxfml = fs.readFileSync(path.join(tmp, "model.lxfml"), "utf8");
  const catalog = parseStudioLxfmlBrickCatalog(lxfml);
  const ldr = fs.readFileSync(path.join(tmp, "modelv2.ldr"), "utf8");
  const parsed = parseStudioIoLdrText(ldr, null, {
    brickCatalog: catalog.size ? catalog : undefined,
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  return { placements: pickStudioIoBomPlacements(parsed), catalog };
}

function elementColorByItemNos(itemNos: string[], dbPath: string): Map<string, { colorId: number }> {
  const db = new Database(dbPath, { readonly: true });
  const out = new Map<string, { colorId: number }>();
  const uniq = [...new Set(itemNos.filter(Boolean))];
  const CHUNK = 400;
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const slice = uniq.slice(i, i + CHUNK);
    const placeholders = slice.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT element_id AS elementId, color_id AS colorId FROM elements WHERE element_id IN (${placeholders})`
      )
      .all(...slice) as { elementId: string; colorId: number }[];
    for (const r of rows) out.set(r.elementId, { colorId: r.colorId });
  }
  db.close();
  return out;
}

function elementIdentityByItemNos(
  itemNos: string[],
  dbPath: string
): Map<string, { partNum: string; colorId: number }> {
  const db = new Database(dbPath, { readonly: true });
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
  catalog: ReturnType<typeof loadIoFromPath>["catalog"],
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
  placements: ReturnType<typeof loadIoFromPath>["placements"],
  catalog: ReturnType<typeof loadIoFromPath>["catalog"],
  dbPath: string
): AggRow[] {
  const itemNos = [...catalog.values()].map((b) => b.legoItemNo);
  const elementColors = elementColorByItemNos(itemNos, dbPath);
  const catalogItemNos = new Set([...catalog.values()].map((b) => b.legoItemNo));
  let enriched = enrichStudioIoPlacementsWithItemNos(placements, catalog, elementColors);
  const db = new Database(dbPath, { readonly: true });
  enriched = enriched.map((p) => {
    if (p.legoItemNo?.trim() || p.isSubmodelRef) return p;
    const inferred = inferElementId(p.partNum, p.ldrawColorId, catalog, catalogItemNos, db);
    return inferred ? { ...p, legoItemNo: inferred } : p;
  });
  db.close();
  const byItem = elementIdentityByItemNos(
    enriched.map((p) => p.legoItemNo?.trim() ?? "").filter(Boolean),
    dbPath
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

function loadCsvAgg(csvPath: string): Map<string, AggRow> {
  const csvRows = parse(fs.readFileSync(csvPath, "utf8"), {
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

function runCompareMode() {
  const ioPath = readArg("--io") ?? DEFAULT_COMPARE_IO;
  const csvPath = readArg("--csv") ?? DEFAULT_COMPARE_CSV;
  const dbPath = readArg("--db") ?? DEFAULT_DB_PATH;

  const { placements, catalog } = loadIoFromPath(ioPath);
  const ioRows = aggregateIoRows(placements, catalog, dbPath);
  const csvMap = loadCsvAgg(csvPath);

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
    ioPath,
    csvPath,
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

async function main() {
  if (process.argv.includes("--compare")) {
    runCompareMode();
    return;
  }
  await runScanMode();
}

void main();
