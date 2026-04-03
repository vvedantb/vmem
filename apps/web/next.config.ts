import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*", "*.daytonaproxy01.eu"],
  reactCompiler: true,
  experimental: {
    turbopackFileSystemCacheForDev: true,
  },
  transpilePackages: ["@vmem/backend", "@vmem/ui"],
};

export default nextConfig;
