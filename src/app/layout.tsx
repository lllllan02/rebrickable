import type { Metadata } from "next";

import { SiteNav } from "@/components/site-nav";

import "./globals.css";

export const metadata: Metadata = {
  title: "Rebrickable 本地库",
  description: "基于本地 CSV 数据的积木零件与套装浏览",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="app-shell antialiased" suppressHydrationWarning>
        <SiteNav />
        <main className="app-main">{children}</main>
      </body>
    </html>
  );
}
