import { BuildSubjectListPage } from "@/app/build/build-subject-list";
import { BUILD_SUBJECT_SET } from "@/lib/build-subject";

export const dynamic = "force-dynamic";

export default function SetsIndexPage() {
  return <BuildSubjectListPage kind={BUILD_SUBJECT_SET} />;
}
