import { ManualSplitPageBody } from "@/app/mocs/manual-split-page";
import { BUILD_SUBJECT_SET } from "@/lib/build-subject";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ setNum: string }>;
  searchParams: Promise<{ planId?: string }>;
};

export default async function SetManualSplitPage({ params, searchParams }: Props) {
  const { setNum: raw } = await params;
  const setNum = decodeURIComponent(raw);
  const sp = await searchParams;
  return (
    <ManualSplitPageBody
      subjectKind={BUILD_SUBJECT_SET}
      subjectId={setNum}
      planIdParam={sp.planId}
    />
  );
}
