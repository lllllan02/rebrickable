import path from "path";

import { PackUserDataPanel } from "@/app/settings/pack-user-data-panel";
import { USER_DB_GZ } from "@/db/db-paths";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const gzRelativePath = path.join("data", USER_DB_GZ);
  const uploadsRelativePath = path.join("data", "build-uploads");

  return (
    <div className="page-stack">
      <section className="space-y-2">
        <p className="page-kicker">Settings</p>
        <h1 className="page-title">设置与备份</h1>
        <p className="text-sm text-[var(--muted)]">
          本地用户库（MOC 资料、零件表、拼搭进度等）的压缩备份；不含只读目录库{" "}
          <code className="code-pill">rebrickable.db</code>。
        </p>
      </section>
      <PackUserDataPanel gzRelativePath={gzRelativePath} uploadsRelativePath={uploadsRelativePath} />
    </div>
  );
}
