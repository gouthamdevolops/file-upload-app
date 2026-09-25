import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@earendil-works/pi-coding-agent",
    "@llamaindex/liteparse",
    "pdf-parse",
    "pdfjs-dist",
  ],
};

export default nextConfig;
