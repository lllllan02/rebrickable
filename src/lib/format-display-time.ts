/** 界面统一以北京时间展示存储的 UTC ISO 时间戳，避免 SSR（UTC）与浏览器本地时区不一致。 */
export const DISPLAY_TIME_ZONE = "Asia/Shanghai";

export function parseIsoInstant(iso: string | null | undefined): Date | null {
  const s = iso?.trim();
  if (!s || s.length < 10) return null;
  const normalized = s.includes("T") ? s : s.replace(" ", "T");
  const ts = Date.parse(normalized);
  if (Number.isNaN(ts)) return null;
  return new Date(ts);
}

/** YYYY-MM-DD HH:mm:ss（北京时间） */
export function formatIsoDateTimeFull(iso: string | null | undefined): string | null {
  const d = parseIsoInstant(iso);
  if (!d) return null;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

/** MM/DD HH:mm（北京时间，工作流进度等紧凑展示） */
export function formatIsoDateTimeShort(iso: string | null | undefined): string | null {
  const d = parseIsoInstant(iso);
  if (!d) return null;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: DISPLAY_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** YYYY-MM-DD（北京时间，仅日期） */
export function formatIsoDateOnly(iso: string | null | undefined): string | null {
  const d = parseIsoInstant(iso);
  if (!d) return null;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** 完整 locale 日期时间（北京时间） */
export function formatIsoDateTimeLocale(iso: string | null | undefined): string | null {
  const d = parseIsoInstant(iso);
  if (!d) return null;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: DISPLAY_TIME_ZONE,
    hour12: false,
  }).format(d);
}

function formatYearMonthInDisplayTz(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  if (!year || !month) return "";
  return `${year}-${month}`;
}

/** 当前北京时间下的 YYYY-MM 月份键 */
export function currentMonthKeyInDisplayTz(now: Date = new Date()): string {
  return formatYearMonthInDisplayTz(now);
}

/** ISO 时间戳在北京时区下的 YYYY-MM 月份键 */
export function isoTimestampMonthKeyInDisplayTz(iso: string | null | undefined): string | null {
  const d = parseIsoInstant(iso);
  if (!d) return null;
  const key = formatYearMonthInDisplayTz(d);
  return key || null;
}
