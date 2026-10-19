/**
 * Runs the PostgreSQL integration tests (tests/integration/food-db.test.ts and
 * tests/integration/ai-settings-db.test.ts, tests/integration/demo-seed-db.test.ts,
 * tests/integration/chat-history-db.test.ts), one file at a time.
 *
 * Uses DATABASE_URL_TEST if set; otherwise derives it from DATABASE_URL by
 * switching the database name to "<name>_test" on the same server. Prisma
 * creates that database if it does not exist. The suite only runs against a
 * database whose name contains "test", so the main database is never touched.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";

const local = existsSync(".env.local") ? parse(readFileSync(".env.local")) : {};
let testUrl = process.env.DATABASE_URL_TEST ?? local.DATABASE_URL_TEST;

if (!testUrl) {
  const base = process.env.DATABASE_URL ?? local.DATABASE_URL;
  if (!base) {
    console.error(
      "Set DATABASE_URL or DATABASE_URL_TEST (e.g. in .env.local) to run the DB tests.",
    );
    process.exit(1);
  }
  const url = new URL(base);
  const name = url.pathname.replace(/^\//, "") || "postgres";
  url.pathname = `/${name}_test`;
  testUrl = url.toString();
}

const result = spawnSync(
  "npx",
  [
    "vitest",
    "run",
    "--no-file-parallelism",
    "tests/integration/food-db.test.ts",
    "tests/integration/ai-settings-db.test.ts",
    "tests/integration/demo-seed-db.test.ts",
    "tests/integration/chat-history-db.test.ts",
  ],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, DATABASE_URL_TEST: testUrl },
  },
);
process.exit(result.status ?? 1);
