-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "currentIntent" TEXT NOT NULL,
    "allergies" TEXT[],
    "profile" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Conversation_expiresAt_idx" ON "Conversation"("expiresAt");
