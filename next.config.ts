import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@earendil-works/pi-coding-agent",
    "@llamaindex/liteparse",
  ],
};

export default nextConfig;
