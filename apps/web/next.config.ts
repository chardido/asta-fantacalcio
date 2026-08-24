import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@asta/domain", "@asta/contracts", "@asta/db"],
};

export default nextConfig;
