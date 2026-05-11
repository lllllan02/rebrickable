import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/parts-sheet", destination: "/mocs/import", permanent: true },
      { source: "/shortage", destination: "/mocs/import", permanent: true },
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
