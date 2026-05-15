"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";

type TabKey = "my" | "favorite";

export type HomeMyFavoriteDefaultTab = TabKey;

/** 大板块内「我的 / 收藏」切换；两面板均由服务端预渲染，此处仅控制显隐 */
export function HomeMyFavoriteTabs({
  myLabel = "我的",
  favoriteLabel = "收藏",
  myPanel,
  favoritePanel,
  defaultTab = "my",
}: {
  myLabel?: string;
  favoriteLabel?: string;
  myPanel: ReactNode;
  favoritePanel: ReactNode;
  defaultTab?: TabKey;
}) {
  const baseId = useId();
  const [tab, setTab] = useState<TabKey>(defaultTab);
  const myId = `${baseId}-my`;
  const favId = `${baseId}-fav`;

  const tabBtn =
    "relative rounded-t-md border border-b-0 px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

  return (
    <div className="home-my-fav-tabs">
      <div
        role="tablist"
        aria-label="我的与收藏"
        className="flex flex-wrap gap-0 border-b border-[var(--border)]"
      >
        <button
          type="button"
          role="tab"
          id={myId}
          aria-selected={tab === "my"}
          aria-controls={`${myId}-panel`}
          tabIndex={tab === "my" ? 0 : -1}
          className={`${tabBtn} ${
            tab === "my"
              ? "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]"
              : "border-transparent bg-transparent text-[var(--muted)] hover:text-[var(--text)]"
          }`}
          onClick={() => setTab("my")}
        >
          {myLabel}
        </button>
        <button
          type="button"
          role="tab"
          id={favId}
          aria-selected={tab === "favorite"}
          aria-controls={`${favId}-panel`}
          tabIndex={tab === "favorite" ? 0 : -1}
          className={`${tabBtn} ${
            tab === "favorite"
              ? "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]"
              : "border-transparent bg-transparent text-[var(--muted)] hover:text-[var(--text)]"
          }`}
          onClick={() => setTab("favorite")}
        >
          {favoriteLabel}
        </button>
      </div>
      <div
        id={`${myId}-panel`}
        role="tabpanel"
        aria-labelledby={myId}
        hidden={tab !== "my"}
        className="border border-t-0 border-[var(--border)] bg-[var(--surface-2)]/40 p-4 sm:p-5"
      >
        {myPanel}
      </div>
      <div
        id={`${favId}-panel`}
        role="tabpanel"
        aria-labelledby={favId}
        hidden={tab !== "favorite"}
        className="border border-t-0 border-[var(--border)] bg-[var(--surface-2)]/40 p-4 sm:p-5"
      >
        {favoritePanel}
      </div>
    </div>
  );
}
