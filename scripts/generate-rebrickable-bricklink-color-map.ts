/**
 * 根据 BrickLink Color Guide 与本地 `colors` 表色名生成 Rebrickable id → BrickLink id 映射。
 * 用法：pnpm tsx scripts/generate-rebrickable-bricklink-color-map.ts
 *
 * 需先抓取 BrickLink 色表文本到 agent-tools 或替换 BL_GUIDE_PATH；
 * 本脚本亦可用 curl 拉取 catalogColors 页面（可能被 Cloudflare 拦截）。
 */
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const ROOT = path.join(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "rebrickable.db");
const OUT_PATH = path.join(ROOT, "src/lib/rebrickable-bricklink-color-map.json");
/** BrickLink Color Guide 页面纯文本；可通过 argv[2] 指定路径 */
const BL_GUIDE_PATH =
  process.argv[2] ?? path.join(ROOT, "scripts", "data", "bricklink-color-guide.txt");

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function loadBrickLinkByNormName(guideText: string): Map<string, number> {
  const blByNorm = new Map<string, number>();
  for (const line of guideText.split("\n")) {
    const t = line.trim();
    const m = t.match(/^(.+?)(\d+)$/);
    if (!m || t.length > 80) continue;
    const name = m[1]!.trim();
    const id = Number(m[2]);
    if (!name || name.length < 2 || !Number.isFinite(id)) continue;
    blByNorm.set(norm(name), id);
  }
  return blByNorm;
}

const NAME_ALIASES: Record<string, string> = {
  darkstonegray: "darkbluishgray",
  lightstonegray: "lightbluishgray",
};

function main() {
  if (!fs.existsSync(BL_GUIDE_PATH)) {
    console.error(`缺少 BrickLink 色表缓存: ${BL_GUIDE_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(DB_PATH)) {
    console.error(`缺少目录库: ${DB_PATH}`);
    process.exit(1);
  }

  const blByNorm = loadBrickLinkByNormName(fs.readFileSync(BL_GUIDE_PATH, "utf8"));
  const db = new Database(DB_PATH, { readonly: true });
  const rbRows = db.prepare("SELECT id, name FROM colors ORDER BY id").all() as {
    id: number;
    name: string;
  }[];
  db.close();

  const map: Record<string, number> = {};
  let unmapped = 0;
  for (const { id, name } of rbRows) {
    if (id < 0) continue;
    const n = norm(name);
    const alias = NAME_ALIASES[n];
    const bl = blByNorm.get(n) ?? (alias ? blByNorm.get(alias) : undefined);
    if (bl != null) map[String(id)] = bl;
    else unmapped++;
  }

  const out = {
    version: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    map,
    unmappedCount: unmapped,
  };
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(out)}\n`);
  console.log(`已写入 ${OUT_PATH}，映射 ${Object.keys(map).length} 条，未匹配 ${unmapped} 条。`);
  console.log("示例 Green RB2 -> BL", map["2"]);
}

main();
