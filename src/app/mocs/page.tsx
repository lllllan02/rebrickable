import { BUILD_SUBJECT_MOC } from "@/lib/build-subject";

import { BuildSubjectListPage } from "@/app/build/build-subject-list";

export const dynamic = "force-dynamic";

export default function MocsPage() {
  return <BuildSubjectListPage kind={BUILD_SUBJECT_MOC} />;
}
