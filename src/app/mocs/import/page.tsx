import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ loadMoc?: string | string[] }>;
};

/** 旧链接兼容：跳转到对应 MOC 详情页的零件表区域 */
export default async function MocImportLegacyRedirect({ searchParams }: Props) {
  const sp = await searchParams;
  const raw = sp.loadMoc;
  const loadMocId =
    typeof raw === "string"
      ? raw.trim() || undefined
      : Array.isArray(raw)
        ? raw[0]?.trim() || undefined
        : undefined;

  if (loadMocId) {
    redirect(`/mocs/${encodeURIComponent(loadMocId)}`);
  }
  redirect("/mocs");
}
