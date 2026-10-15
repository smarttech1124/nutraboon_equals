import "@testing-library/jest-dom/vitest";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";

// Only the test database URL is taken from .env.local; tests never read the
// dev DATABASE_URL or AI keys.
if (!process.env.DATABASE_URL_TEST && existsSync(".env.local")) {
  const local = parse(readFileSync(".env.local"));
  if (local.DATABASE_URL_TEST) process.env.DATABASE_URL_TEST = local.DATABASE_URL_TEST;
}
