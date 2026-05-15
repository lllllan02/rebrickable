import { BuildSubjectListPage } from "@/app/build/build-subject-list";
import { parseListMarkFilter } from "@/lib/build-list-mark-filter";
import { BUILD_SUBJECT_MOC } from "@/lib/build-subject";
import { parseMocListSort } from "@/lib/moc-list-sort";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string; tag?: string; mark?: string; sort?: string; dir?: string }> };

export default async function MocsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const listMocSortState = parseMocListSort(sp.sort, sp.dir);
  return (
    <BuildSubjectListPage
      kind={BUILD_SUBJECT_MOC}
      listFilterQ={sp.q}
      listFilterTag={sp.tag}
      listFilterMark={parseListMarkFilter(sp.mark)}
      listMocSortState={listMocSortState}
      listHeroTitleOnly
    />
  );
}
