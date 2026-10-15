-- CreateEnum
CREATE TYPE "AIProviderKind" AS ENUM ('gemini', 'openai', 'deepseek');

-- CreateEnum
CREATE TYPE "AICredentialStatus" AS ENUM ('verified', 'failed', 'revoked');

-- CreateEnum
CREATE TYPE "AIConfigAuditAction" AS ENUM ('credential_added', 'verification_succeeded', 'verification_failed', 'activated', 'deactivated', 'revoked', 'model_changed');

-- CreateTable
CREATE TABLE "AIProviderConfig" (
    "id" TEXT NOT NULL,
    "provider" "AIProviderKind" NOT NULL,
    "model" TEXT NOT NULL,
    "label" TEXT,
    "encryptedKey" TEXT,
    "keyHint" TEXT NOT NULL,
    "keyFingerprint" TEXT NOT NULL,
    "status" "AICredentialStatus" NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIActiveConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "configId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIActiveConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIConfigAuditEvent" (
    "id" SERIAL NOT NULL,
    "action" "AIConfigAuditAction" NOT NULL,
    "configId" TEXT,
    "provider" "AIProviderKind" NOT NULL,
    "model" TEXT NOT NULL,
    "keyHint" TEXT NOT NULL,
    "detail" TEXT,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIConfigAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIProviderConfig_keyFingerprint_idx" ON "AIProviderConfig"("keyFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "AIActiveConfig_configId_key" ON "AIActiveConfig"("configId");

-- CreateIndex
CREATE INDEX "AIConfigAuditEvent_createdAt_idx" ON "AIConfigAuditEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "AIActiveConfig" ADD CONSTRAINT "AIActiveConfig_configId_fkey" FOREIGN KEY ("configId") REFERENCES "AIProviderConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Single-row table: at most one active AI configuration (ADR-047).
-- Prisma does not manage CHECK constraints, so it is added here by hand.
ALTER TABLE "AIActiveConfig" ADD CONSTRAINT "AIActiveConfig_single_row" CHECK ("id" = 1);
