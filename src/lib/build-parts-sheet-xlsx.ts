import { sheetTagsDisplayZh, type PartsSheetTag } from "@/lib/parts-sheet-tags";

type ExcelJSModule = typeof import("exceljs");

/** 与 {@link ShortageResolveItem} 一致，用于导出（不含 rowId） */
export type PartsSheetXlsxRow = {
  lineNumber: number;
  partNum: string;
  colorId: number;
  quantity: number;
  rest: string;
  partFound: boolean;
  partName: string | null;
  partCatName: string | null;
  isPrinted: boolean;
  sheetTags: PartsSheetTag[];
  colorName: string | null;
  elementKnown: boolean;
  imgUrl: string | null;
  imgSource: "color" | "part" | null;
};

const ALLOWED_IMG_HOST = "cdn.rebrickable.com";
const THUMB_PX = 64;
const DATA_ROW_HEIGHT_PT = 52;

/** 缩略图所在列（0-based），置于「导入列 + 追加列」之后 */
const IMAGE_COL_INDEX = 11;

function isAllowedImgUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === ALLOWED_IMG_HOST;
  } catch {
    return false;
  }
}

function sniffImageExtension(buf: Uint8Array): "jpeg" | "png" | "gif" | null {
  if (buf.byteLength >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.byteLength >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return "png";
  if (buf.byteLength >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "gif";
  return null;
}

async function fetchRowImage(
  url: string
): Promise<{ data: Uint8Array; extension: "jpeg" | "png" | "gif" } | null> {
  if (!isAllowedImgUrl(url)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = new Uint8Array(await res.arrayBuffer());
    const extension = sniffImageExtension(data);
    if (!extension) return null;
    return { data, extension };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function imgSourceLabel(src: PartsSheetXlsxRow["imgSource"]): string {
  if (src === "color") return "当前颜色";
  if (src === "part") return "异色零件";
  return "—";
}

function resolveExcelJs(mod: ExcelJSModule): ExcelJSModule {
  const d = (mod as unknown as { default?: ExcelJSModule }).default;
  return d && typeof d.Workbook === "function" ? d : mod;
}

export type BuildXlsxProgress =
  | { phase: "row"; doneRows: number; totalRows: number }
  | { phase: "file" };

/**
 * 生成 xlsx：前四列与 CSV 导入一致（Part, Color, Quantity, Rest），缩略图与本地解析信息追加在右侧。
 */
export async function buildPartsSheetXlsxBuffer(
  rows: PartsSheetXlsxRow[],
  onProgress?: (p: BuildXlsxProgress) => void
): Promise<Buffer> {
  const ExcelJS = resolveExcelJs(await import("exceljs"));
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "rebrickable-local";
  const sheet = workbook.addWorksheet("零件表", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { width: 14 },
    { width: 9 },
    { width: 8 },
    { width: 48 },
    { width: 36 },
    { width: 22 },
    { width: 10 },
    { width: 10 },
    { width: 12 },
    { width: 18 },
    { width: 11 },
    { width: 12 },
  ];

  const headers = [
    "Part",
    "Color",
    "Quantity",
    "Rest",
    "零件名称",
    "颜色名称",
    "本地收录",
    "elements",
    "图来源",
    "分类",
    "原CSV行号",
    "缩略图",
  ];
  sheet.addRow(headers);
  const h = sheet.getRow(1);
  h.font = { bold: true };
  h.height = 20;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const excelRowIndex = i + 2;
    sheet.addRow([
      row.partNum,
      row.colorId,
      row.quantity,
      row.rest,
      row.partName ?? "",
      row.colorName ?? "",
      row.partFound ? "是" : "否",
      row.elementKnown ? "是" : "否",
      imgSourceLabel(row.imgSource),
      sheetTagsDisplayZh(row.sheetTags) || (row.partFound ? "—" : ""),
      row.lineNumber,
      "",
    ]);

    const sheetRow = sheet.getRow(excelRowIndex);
    sheetRow.height = DATA_ROW_HEIGHT_PT;
    sheetRow.getCell(1).numFmt = "@";

    if (row.imgUrl) {
      try {
        const img = await fetchRowImage(row.imgUrl);
        if (img && img.data.byteLength > 0) {
          const imageId = workbook.addImage({
            buffer: Buffer.from(img.data) as never,
            extension: img.extension,
          });
          sheet.addImage(imageId, {
            tl: { col: IMAGE_COL_INDEX, row: excelRowIndex - 1 + 0.06 },
            ext: { width: THUMB_PX, height: THUMB_PX },
          });
        }
      } catch {
        /* 单张图失败时跳过，不影响整表导出 */
      }
    }
    onProgress?.({ phase: "row", doneRows: i + 1, totalRows: rows.length });
  }

  onProgress?.({ phase: "file" });
  const raw = await workbook.xlsx.writeBuffer();
  if (Buffer.isBuffer(raw)) return raw;
  return Buffer.from(raw as ArrayBuffer);
}
