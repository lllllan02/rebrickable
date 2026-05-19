/**
 * 诊断 .io 解析与零件表对照
 * 用法: npx tsx scripts/diagnose-io-parse.ts [mocId]
 */
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

import { readdirSync } from "fs";

import { readStudioIoLdrFromExtractDir } from "../src/lib/pick-studio-io-ldr";
import { parseStudioLxfmlBrickCatalog } from "../src/lib/parse-studio-lxfml";
import {
  parseStudioIoLdrText,
  pickStudioIoBomPlacements,
  STUDIO_IO_ZIP_PASSWORD,
} from "../src/lib/parse-studio-io";

async function diagnoseIo(ioPath: string) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rb-diag-"));
  execFileSync("unzip", ["-P", STUDIO_IO_ZIP_PASSWORD, "-oq", ioPath, "-d", tmp]);

  let catalog: ReturnType<typeof parseStudioLxfmlBrickCatalog> | undefined;
  let lxfmlText: string | undefined;
  try {
    lxfmlText = fs.readFileSync(path.join(tmp, "model.lxfml"), "utf8");
    catalog = parseStudioLxfmlBrickCatalog(lxfmlText);
  } catch {
    catalog = undefined;
    lxfmlText = undefined;
  }

  let ldrName: string;
  let ldr: string;
  try {
    const picked = await readStudioIoLdrFromExtractDir(tmp);
    ldrName = picked.name;
    ldr = picked.text;
  } catch {
    fs.rmSync(tmp, { recursive: true, force: true });
    return { ioPath, error: "no ldr" };
  }

  const typeLines = ldr.split(/\r?\n/).filter((l) => /^(1|10|11)\s/.test(l.trim()));
  const stepCount = ldr.split(/\r?\n/).filter((l) => l.trim() === "0 STEP").length;

  let parsed;
  try {
    parsed = parseStudioIoLdrText(ldr, null, {
      brickCatalog: catalog?.size ? catalog : undefined,
      lxfmlText,
    });
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    return {
      ioPath,
      ldrName,
      catalogSize: catalog?.size ?? 0,
      rawTypeLines: typeLines.length,
      stepCount,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const stepPlacements = parsed.mainSteps.flatMap((s) => s.newPlacements);
  const bomPlacements = pickStudioIoBomPlacements(parsed);
  const withItemNo = bomPlacements.filter((p) => p.legoItemNo?.trim()).length;
  const submodelRefs = bomPlacements.filter((p) => p.isSubmodelRef).length;

  fs.rmSync(tmp, { recursive: true, force: true });

  return {
    ioPath: ioPath.replace(/.*build-uploads\//, ""),
    ldrName,
    catalogSize: catalog?.size ?? 0,
    rawTypeLines: typeLines.length,
    stepCount,
    parsedSteps: parsed.mainSteps.length,
    stepPlacements: stepPlacements.length,
    bomPlacements: bomPlacements.length,
    withItemNo,
    submodelRefs,
    bomVsLdr: bomPlacements.length - typeLines.length,
  };
}

async function main() {
  const mocFilter = process.argv[2];
  const base = path.join("data/build-uploads/moc");
  const mocDirs = mocFilter
    ? [path.join(base, mocFilter)]
    : readdirSync(base, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => path.join(base, d.name));
  const files = mocDirs
    .flatMap((dir) =>
      fs.existsSync(dir)
        ? readdirSync(dir)
            .filter((f) => f.endsWith(".io"))
            .map((f) => path.join(dir, f))
        : []
    )
    .sort();
  for (const f of files) {
    console.log(JSON.stringify(await diagnoseIo(f)));
  }
}

void main();
