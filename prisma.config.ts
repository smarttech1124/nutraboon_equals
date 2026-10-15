import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Next.js reads .env.local itself; the Prisma CLI needs it loaded explicitly.
config({ path: ".env.local", quiet: true });
config({ quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Plain lookup (not env()) so `prisma generate` works without a database;
    // migrate/seed commands still fail clearly when it is missing. Migrations
    // prefer a direct connection: poolers often cannot run them.
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  },
});
