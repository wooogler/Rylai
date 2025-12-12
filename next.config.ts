import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker deployment
  output: 'standalone',

  // Mark packages as external to prevent bundling in client
  serverExternalPackages: ['better-sqlite3', 'drizzle-orm'],

  // Skip type checking during build (types will be checked by IDE)
  typescript: {
    ignoreBuildErrors: true,
  },

  // Skip ESLint during build
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
