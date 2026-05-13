import { BuildSubjectListPage } from "@/app/build/build-subject-list";
import { parseListMarkFilter } from "@/lib/build-list-mark-filter";
import { BUILD_SUBJECT_MOC } from "@/lib/build-subject";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string; tag?: string; mark?: string }> };

export default async function MocsPage({ searchParams }: Props) {
  const sp = await searchParams;
  return (
    <BuildSubjectListPage
      kind={BUILD_SUBJECT_MOC}
      listFilterQ={sp.q}
      listFilterTag={sp.tag}
      listFilterMark={parseListMarkFilter(sp.mark)}
    />
  );
}
