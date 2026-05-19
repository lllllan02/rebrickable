import Database from "better-sqlite3";

import { catalogDbPath } from "@/db/db-paths";

const globalForCatalog = globalThis as typeof globalThis & {
  __bomCompareCatalogSqlite?: Database.Database;
};

function getCatalogSqlite(): Database.Database {
  if (!globalForCatalog.__bomCompareCatalogSqlite) {
    globalForCatalog.__bomCompareCatalogSqlite = new Database(catalogDbPath(), {
      readonly: true,
      fileMustExist: true,
    });
  }
  return globalForCatalog.__bomCompareCatalogSqlite;
}

/**
 * 对给定 part_num 列表，在 `part_relationships`（A/M）上求连通分量，用于 BOM 对照别名。
 */
export function buildPartSubstituteClosure(
  partNums: Iterable<string>
): Map<string, Set<string>> {
  const seeds = [...new Set([...partNums].map((p) => p.trim()).filter(Boolean))];
  if (!seeds.length) return new Map();

  const ph = seeds.map(() => "?").join(",");
  const rows = getCatalogSqlite()
    .prepare(
      `SELECT parent_part_num AS parent, child_part_num AS child
       FROM part_relationships
       WHERE rel_type IN ('A', 'M')
         AND (parent_part_num IN (${ph}) OR child_part_num IN (${ph}))`
    )
    .all(...seeds, ...seeds) as { parent: string; child: string }[];

  const nodes = new Set<string>(seeds);
  for (const r of rows) {
    nodes.add(r.parent);
    nodes.add(r.child);
  }

  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let p = parent.get(x) ?? x;
    if (p !== x) {
      p = find(p);
      parent.set(x, p);
    } else {
      parent.set(x, x);
    }
    return p;
  };
  const unite = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const n of nodes) find(n);
  for (const r of rows) unite(r.parent, r.child);

  const groups = new Map<string, Set<string>>();
  for (const n of nodes) {
    const root = find(n);
    let g = groups.get(root);
    if (!g) {
      g = new Set();
      groups.set(root, g);
    }
    g.add(n);
  }

  const closure = new Map<string, Set<string>>();
  for (const g of groups.values()) {
    for (const n of g) {
      closure.set(n.toLowerCase(), g);
    }
  }
  return closure;
}
