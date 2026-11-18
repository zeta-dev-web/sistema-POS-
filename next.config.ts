import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El cliente Prisma con driver adapter corre en Node, no en el runtime edge.
  serverExternalPackages: ["@prisma/adapter-pg", "pg"],
};

export default nextConfig;
