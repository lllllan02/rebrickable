import archiver from "archiver";

export type IoSplitPlanZipEntry = {
  filename: string;
  buffer: Buffer;
};

export async function buildIoSplitPlanZipBuffer(entries: IoSplitPlanZipEntry[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 6 } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
    for (const entry of entries) {
      archive.append(entry.buffer, { name: entry.filename });
    }
    void archive.finalize();
  });
}
