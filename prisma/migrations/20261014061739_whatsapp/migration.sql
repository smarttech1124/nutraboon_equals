-- CreateEnum
CREATE TYPE "WhatsAppConsent" AS ENUM ('opted_in', 'opted_out');

-- CreateEnum
CREATE TYPE "WhatsAppDirection" AS ENUM ('inbound', 'outbound');

-- CreateTable
CREATE TABLE "WhatsAppContact" (
    "id" TEXT NOT NULL,
    "waIdHash" TEXT NOT NULL,
    "consent" "WhatsAppConsent" NOT NULL DEFAULT 'opted_in',
    "conversationId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInboundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "optedOutAt" TIMESTAMP(3),

    CONSTRAINT "WhatsAppContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "direction" "WhatsAppDirection" NOT NULL,
    "status" TEXT NOT NULL,
    "errorCode" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppContact_waIdHash_key" ON "WhatsAppContact"("waIdHash");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_contactId_createdAt_idx" ON "WhatsAppMessage"("contactId", "createdAt");

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "WhatsAppContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
