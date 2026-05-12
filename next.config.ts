import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server Action 默认仅允许约 1 MB 请求体；本应用附件/参考图上传上限更高（见 src/lib/build-upload-storage.ts），
  // 否则 POST 会在解析阶段失败并返回非 RSC 响应，客户端报「An unexpected response was received from the server.」
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  async redirects() {
    return [
      { source: "/parts-sheet", destination: "/mocs", permanent: true },
      { source: "/shortage", destination: "/mocs", permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.rebrickable.com",
        pathname: "/media/**",
      },
    ],
  },
};

export default nextConfig;
