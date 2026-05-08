import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /** 远程图直链，不经 `/_next/image` 代理，避免 CDN 慢/超时时拖垮或刷屏服务端 */
    unoptimized: true,
    remotePatterns: [
      new URL("https://cdn.rebrickable.com/**"),
      new URL("https://rebrickable.com/**"),
    ],
  },
};

export default nextConfig;
