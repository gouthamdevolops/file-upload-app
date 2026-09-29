import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "@earendil-works/pi-coding-agent",
    "@llamaindex/liteparse",
  ],
};

export default nextConfig;
