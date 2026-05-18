import "server-only";

import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";

import { parseStudioIoLdrText, STUDIO_IO_ZIP_PASSWORD, type ParsedStudioIo } from "@/lib/parse-studio-io";

const execFileAsync = promisify(execFile);

/**
 * 从磁盘上的 .io（密码 ZIP）解压并解析主场景步骤。
 */
export async function readStudioIoFromAbsolutePath(absIoPath: string): Promise<ParsedStudioIo> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rb-studio-io-"));
  try {
    await execFileAsync("unzip", ["-P", STUDIO_IO_ZIP_PASSWORD, "-oq", absIoPath, "-d", tmp]);
    const ldrPath = path.join(tmp, "model.ldr");
    let ldr: string;
    try {
      ldr = await fs.readFile(ldrPath, "utf8");
    } catch {
      throw new Error("解压后未找到 model.ldr。");
    }
    let studioVersion: string | null = null;
    try {
      const infoRaw = await fs.readFile(path.join(tmp, ".info"), "utf8");
      const info = JSON.parse(infoRaw) as { version?: string };
      studioVersion = typeof info.version === "string" ? info.version.replace(/\r/g, "") : null;
    } catch {
      studioVersion = null;
    }
    return parseStudioIoLdrText(ldr, studioVersion);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}
