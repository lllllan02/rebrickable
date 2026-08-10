import { ManualSplitPageBody } from "@/app/mocs/manual-split-page";
import { BUILD_SUBJECT_MOC } from "@/lib/build-subject";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ mocId: string }>;
  searchParams: Promise<{ planId?: string }>;
};

export default async function MocManualSplitPage({ params, searchParams }: Props) {
  const { mocId: raw } = await params;
  const mocId = decodeURIComponent(raw);
  const sp = await searchParams;
  return (
    <ManualSplitPageBody
      subjectKind={BUILD_SUBJECT_MOC}
      subjectId={mocId}
      planIdParam={sp.planId}
    />
  );
}
