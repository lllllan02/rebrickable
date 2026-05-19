import "server-only";

import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";

import { parseStudioLxfmlBrickCatalog } from "@/lib/parse-studio-lxfml";
import { parseStudioIoLdrText, STUDIO_IO_ZIP_PASSWORD, type ParsedStudioIo } from "@/lib/parse-studio-io";
import { readStudioIoLdrFromExtractDir } from "@/lib/pick-studio-io-ldr";
import { buildStudioIoElementLookup } from "@/lib/studio-io-element-lookup";

const execFileAsync = promisify(execFile);

/**
 * 从磁盘上的 .io（密码 ZIP）解压并解析主场景步骤。
 */
export async function readStudioIoFromAbsolutePath(absIoPath: string): Promise<ParsedStudioIo> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rb-studio-io-"));
  try {
    await execFileAsync("unzip", ["-P", STUDIO_IO_ZIP_PASSWORD, "-oq", absIoPath, "-d", tmp]);

    let brickCatalog;
    let lxfml: string | undefined;
    try {
      lxfml = await fs.readFile(path.join(tmp, "model.lxfml"), "utf8");
      brickCatalog = parseStudioLxfmlBrickCatalog(lxfml);
    } catch {
      brickCatalog = undefined;
      lxfml = undefined;
    }

    const { text: ldr } = await readStudioIoLdrFromExtractDir(tmp);
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
      lxfmlText: lxfml,
      elementLookup: brickCatalog?.size ? buildStudioIoElementLookup(brickCatalog) : undefined,
    });
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}
