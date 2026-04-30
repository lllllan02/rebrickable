import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LEGO 管理",
  description: "本地优先的 LEGO 套装与 MOC 管理工具",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
