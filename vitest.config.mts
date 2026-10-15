import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@admin": fileURLToPath(new URL("./n-equals", import.meta.url)),
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
    // Starting a worker per test file all at once (8 cores, slow disk) left the
    // jsdom UI worker past Vitest's fixed 60 s start-up limit, silently skipping
    // the UI tests. Fewer concurrent workers start reliably.
    maxWorkers: 4,
  },
});
