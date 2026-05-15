import { HomeMocBlock, HomeSetBlock } from "@/app/home-dashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  return (
    <div className="page-stack">
      <HomeMocBlock />
      <HomeSetBlock />
    </div>
  );
}
