function uuidV4FromGetRandomValues(getRandomValues: (buf: Uint8Array) => void): string {
  const bytes = new Uint8Array(16);
  getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  let s = "";
  for (let i = 0; i < 16; i++) {
    if (i === 4 || i === 6 || i === 8 || i === 10) s += "-";
    s += hex(bytes[i] ?? 0);
  }
  return s;
}

/**
 * 与 `crypto.randomUUID()` 等价，在缺少 `randomUUID` 的环境（部分浏览器 / 旧运行时）
 * 上用 `getRandomValues` 生成 RFC4122 v4 UUID。仅用于客户端或可共享模块，勿依赖 Node 内置。
 */
export function randomUUID(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  if (c && typeof c.getRandomValues === "function") {
    return uuidV4FromGetRandomValues(c.getRandomValues.bind(c));
  }
  throw new Error("Web Crypto API (randomUUID / getRandomValues) is not available");
}
