import { BuildSubjectListPage } from "@/app/build/build-subject-list";
import { SetsOfficialCatalogSection } from "@/app/sets/sets-official-catalog-section";
import { BUILD_SUBJECT_SET } from "@/lib/build-subject";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string; page?: string; theme?: string; mark?: string }> };

export default async function SetsIndexPage({ searchParams }: Props) {
  const sp = await searchParams;
  const official = await SetsOfficialCatalogSection({
    searchParams: sp,
    actionBase: "/sets",
  });
  return (
    <BuildSubjectListPage kind={BUILD_SUBJECT_SET} officialCatalogSection={official} />
  );
}
