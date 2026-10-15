import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Qualification documents are up to 3 MB (ADR-064); Vercel caps bodies at 4.5 MB.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
