import { NextResponse } from "next/server";

import {
  bomToGobricksTestList,
  fetchGobricksLego2MergedPayload,
  fulfillmentCsvFromGobricksPayload,
  shortageCsvFromGobricksPayload,
} from "@/lib/gobricks-lego2-item-list";

export const dynamic = "force-dynamic";

const MAX_LINES = 50_000;
const REQUEST_TIMEOUT_MS = 45_000;

type BodyItem = { partNum?: unknown; colorId?: unknown; quantity?: unknown };

function parseItems(body: unknown): { partNum: string; colorId: number; quantity: number }[] | null {
  if (typeof body !== "object" || body === null || !("items" in body)) return null;
  const raw = (body as { items: unknown }).items;
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_LINES) return null;
  const out: { partNum: string; colorId: number; quantity: number }[] = [];
  for (const row of raw) {
    if (typeof row !== "object" || row === null) return null;
    const r = row as BodyItem;
    const partNum = typeof r.partNum === "string" ? r.partNum.trim() : "";
    const colorId = typeof r.colorId === "number" ? r.colorId : Number(r.colorId);
    const quantity = typeof r.quantity === "number" ? r.quantity : Number(r.quantity);
    if (!partNum || !Number.isFinite(colorId) || colorId < 0) return null;
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    out.push({ partNum, colorId: Math.trunc(colorId), quantity: Math.trunc(quantity) });
  }
  return out;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体须为 JSON。" }, { status: 400 });
  }

  const items = parseItems(body);
  if (items === null) {
    return NextResponse.json(
      {
        error: `缺少字段 items（非空数组），或行数超过 ${MAX_LINES.toLocaleString("zh-CN")}，或字段格式无效。`,
      },
      { status: 400 }
    );
  }

  const testList = bomToGobricksTestList(items);
  if (testList.length === 0) {
    return NextResponse.json({ error: "没有可查询的零件行（数量须为正整数）。" }, { status: 400 });
  }
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const merged = await fetchGobricksLego2MergedPayload(testList, {
      signal: controller.signal,
    });
    const csv = shortageCsvFromGobricksPayload(merged);
    const fulfillmentCsv = fulfillmentCsvFromGobricksPayload(merged);
    return NextResponse.json({
      ok: true as const,
      csv,
      fulfillmentCsv,
      lineCount: testList.length,
    });
  } catch (e) {
    const msg =
      controller.signal.aborted
        ? "请求高砖超时，请稍后重试。"
        : e instanceof Error && e.message.trim()
          ? e.message.trim()
          : "请求高砖失败，请检查网络或稍后重试。";
    return NextResponse.json({ error: msg }, { status: 502 });
  } finally {
    clearTimeout(t);
  }
}
