import "server-only";

import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";

import { parseStudioLxfmlBrickCatalog } from "@/lib/parse-studio-lxfml";
import { parseStudioIoLdrText, STUDIO_IO_ZIP_PASSWORD, type ParsedStudioIo } from "@/lib/parse-studio-io";

const execFileAsync = promisify(execFile);

/**
 * 从磁盘上的 .io（密码 ZIP）解压并解析主场景步骤。
 */
export async function readStudioIoFromAbsolutePath(absIoPath: string): Promise<ParsedStudioIo> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rb-studio-io-"));
  try {
    await execFileAsync("unzip", ["-P", STUDIO_IO_ZIP_PASSWORD, "-oq", absIoPath, "-d", tmp]);

    let brickCatalog;
    try {
      const lxfml = await fs.readFile(path.join(tmp, "model.lxfml"), "utf8");
      brickCatalog = parseStudioLxfmlBrickCatalog(lxfml);
    } catch {
      brickCatalog = undefined;
    }

    const ldrCandidates = ["modelv2.ldr", "model.ldr"] as const;
    let ldr: string | null = null;
    for (const name of ldrCandidates) {
      try {
        ldr = await fs.readFile(path.join(tmp, name), "utf8");
        break;
      } catch {
        /* try next */
      }
    }
    if (ldr == null) {
      throw new Error("解压后未找到 model.ldr / modelv2.ldr。");
    }
    let studioVersion: string | null = null;
    try {
      const infoRaw = await fs.readFile(path.join(tmp, ".info"), "utf8");
      const info = JSON.parse(infoRaw) as { version?: string };
      studioVersion = typeof info.version === "string" ? info.version.replace(/\r/g, "") : null;
    } catch {
      studioVersion = null;
    }
    return parseStudioIoLdrText(ldr, studioVersion, {
      brickCatalog: brickCatalog?.size ? brickCatalog : undefined,
    });
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}
