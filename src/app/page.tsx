import { HomeCatalogStats } from "@/app/home-catalog-stats";
import { HomeOwnedCollection } from "@/app/home-owned-section";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  return (
    <div className="page-stack">
      <HomeCatalogStats />

      <section id="owned" className="scroll-mt-24" aria-label="我的拥有">
        <HomeOwnedCollection />
      </section>
    </div>
  );
}
