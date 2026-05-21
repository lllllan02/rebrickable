"use server";

import { packUserData } from "@/lib/pack-user-data";

export type PackUserDataActionResult =
  | {
      ok: true;
      gzPath: string;
      gzBytes: number;
      dbBytes: number;
      packedAt: string;
    }
  | { ok: false; error: string };

export async function packUserDataAction(): Promise<PackUserDataActionResult> {
  const res = await packUserData();
  if (!res.ok) return res;
  return {
    ok: true,
    gzPath: res.gzPath,
    gzBytes: res.gzBytes,
    dbBytes: res.dbBytes,
    packedAt: new Date().toISOString(),
  };
}
