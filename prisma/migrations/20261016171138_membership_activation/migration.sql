-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "activatedAt" TIMESTAMP(3);

-- Everyone who is already a member keeps access (ADR-089).
UPDATE "Membership" SET "activatedAt" = "createdAt" WHERE "activatedAt" IS NULL;
