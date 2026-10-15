-- CreateEnum
CREATE TYPE "XeelaaStatus" AS ENUM ('verified', 'invalid');

-- AlterEnum
ALTER TYPE "AIProviderKind" ADD VALUE 'xeelaa';

-- CreateTable
CREATE TABLE "XeelaaIntegration" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "encryptedKey" TEXT,
    "keyHint" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "XeelaaStatus" NOT NULL,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XeelaaIntegration_pkey" PRIMARY KEY ("id")
);

-- Single-row table (ADR-052). Prisma does not manage CHECK constraints.
ALTER TABLE "XeelaaIntegration" ADD CONSTRAINT "XeelaaIntegration_single_row" CHECK ("id" = 1);
