import { Settings } from "lucide-react";

import { saveApiKeyAction } from "../actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { getApiKeySettings } from "@/lib/rebrickable/downloads";
import { ApiKeyDisplay } from "./api-key-display";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const apiKey = getApiKeySettings();
  const sourceText =
    apiKey.source === "env" ? "环境变量" : apiKey.source === "database" ? "本地 SQLite" : null;
  const description =
    apiKey.source === "env"
      ? "当前优先使用环境变量 REBRICKABLE_API_KEY。保存后会更新本地 SQLite 中的备用 API Key。"
      : sourceText
        ? `当前使用${sourceText}中的 API Key。`
        : "API Key 会保存在本地 SQLite，也可以使用环境变量 REBRICKABLE_API_KEY。";

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">设置</h1>
          <p className="mt-2 text-sm text-slate-500">
            管理 Rebrickable 下载所需的基础配置。
          </p>
        </div>
      </header>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            <CardTitle>Rebrickable API</CardTitle>
          </div>
          <Badge tone={apiKey.isConfigured ? "completed" : "pending"}>
            {apiKey.isConfigured ? "已配置" : "未配置"}
          </Badge>
        </div>
        <CardDescription>{description}</CardDescription>
        <form action={saveApiKeyAction}>
          <ApiKeyDisplay value={apiKey.value} />
        </form>
      </Card>
    </main>
  );
}
