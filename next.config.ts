import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      new URL("https://cdn.rebrickable.com/**"),
      new URL("https://rebrickable.com/**"),
    ],
  },
};

export default nextConfig;
