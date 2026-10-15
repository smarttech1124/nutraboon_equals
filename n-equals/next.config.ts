import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

/** The repository root: shared lib/, prisma/, styles/ and the .env files live there. */
const root = path.join(__dirname, "..");

// One set of environment files for both apps (.env.local at the root).
// forceReload: Next has already loaded this folder's (absent) env files and
// marked the environment as processed, so a plain call would do nothing.
loadEnvConfig(root, process.env.NODE_ENV !== "production", console, true);

const nextConfig: NextConfig = {
  // Resolve and trace the shared code outside this folder (ADR-060).
  turbopack: { root },
  outputFileTracingRoot: root,
};

export default nextConfig;
