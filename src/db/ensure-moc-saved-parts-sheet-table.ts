import type Database from "better-sqlite3";

function tableHasColumn(sqlite: Database.Database, table: string, column: string): boolean {
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((r) => r.name === column);
}

/** 从已存 payload JSON 累加 quantity（迁移/回填用，宽松解析） */
function sumQuantitiesFromMocPayloadJson(payloadJson: string): number {
  try {
    const o = JSON.parse(payloadJson) as { items?: unknown };
    if (!Array.isArray(o.items)) return 0;
    let s = 0;
    for (const it of o.items) {
      if (it && typeof it === "object" && "quantity" in it) {
        const q = (it as { quantity: unknown }).quantity;
        if (typeof q === "number" && Number.isFinite(q)) s += q;
      }
    }
    return s;
  } catch {
    return 0;
  }
}

/** 与 Drizzle `mocSavedPartsSheets` 一致；IF NOT EXISTS 以便 `db:import` 全量重建时不丢用户数据 */
export function ensureMocSavedPartsSheetTable(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS moc_saved_parts_sheets (
      moc_id TEXT PRIMARY KEY,
      skipped_header INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      line_count INTEGER NOT NULL,
      total_part_qty INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS moc_saved_parts_updated_idx ON moc_saved_parts_sheets(updated_at);
  `);

  if (!tableHasColumn(sqlite, "moc_saved_parts_sheets", "total_part_qty")) {
    sqlite.exec(
      `ALTER TABLE moc_saved_parts_sheets ADD COLUMN total_part_qty INTEGER NOT NULL DEFAULT 0;`
    );
    const rows = sqlite
      .prepare(`SELECT moc_id, payload_json FROM moc_saved_parts_sheets`)
      .all() as { moc_id: string; payload_json: string }[];
    const upd = sqlite.prepare(
      `UPDATE moc_saved_parts_sheets SET total_part_qty = ? WHERE moc_id = ?`
    );
    for (const r of rows) {
      upd.run(sumQuantitiesFromMocPayloadJson(r.payload_json), r.moc_id);
    }
  }
}
