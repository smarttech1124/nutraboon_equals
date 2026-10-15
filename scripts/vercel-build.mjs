/**
 * Vercel build step (ADR-038): apply migrations and seed, then build.
 *
 * - Production deployments migrate and seed by default.
 * - Preview deployments skip the database unless RUN_DB_MIGRATIONS=true, so a
 *   preview can never change the production schema by accident. Give previews
 *   their own DATABASE_URL before turning this on for them.
 * - Without a database URL the database step is skipped; the app still runs,
 *   just without food and price data (ADR-028).
 * - A failed migration or seed fails the build, so code never ships against
 *   a schema it does not match.
 *
 * Environment:
 *   DATABASE_URL          runtime connection (may be pooled)
 *   DIRECT_DATABASE_URL   optional direct connection for migrations and seed
 *   RUN_DB_MIGRATIONS     "true" to force, "false" to skip, unset = production only
 *   SEED_ON_DEPLOY        "false" to skip the seed (default: seed after migrating)
 */
import { spawnSync } from "node:child_process";

function run(command, args) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(
      `\n"${command} ${args.join(" ")}" failed (exit ${result.status}); stopping the build.`,
    );
    process.exit(result.status ?? 1);
  }
}

const env = process.env.VERCEL_ENV ?? "local";
const override = process.env.RUN_DB_MIGRATIONS;
const wantsDatabase = override === "true" || (override !== "false" && env === "production");
const hasDatabase = Boolean(process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL);

if (!wantsDatabase) {
  console.log(
    `Skipping database migrations for the "${env}" environment (set RUN_DB_MIGRATIONS=true to run them).`,
  );
} else if (!hasDatabase) {
  console.warn(
    "DATABASE_URL is not set: skipping migrations. The app will run without food and price data.",
  );
} else {
  run("npx", ["prisma", "migrate", "deploy"]);
  if (process.env.SEED_ON_DEPLOY === "false") {
    console.log("SEED_ON_DEPLOY=false: skipping the seed.");
  } else {
    // Idempotent: makes food and price tables match prisma/seed/*.json.
    run("npx", ["prisma", "db", "seed"]);
  }
}

run("npx", ["next", "build"]);
