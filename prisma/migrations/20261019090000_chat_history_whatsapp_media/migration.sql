-- CreateEnum
CREATE TYPE "WhatsAppVoiceReplies" AS ENUM ('auto', 'always', 'never');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "title" TEXT,
ADD COLUMN     "userId" TEXT,
ALTER COLUMN "expiresAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "WhatsAppContact" ADD COLUMN     "resetAt" TIMESTAMP(3),
ADD COLUMN     "signVideos" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "voiceReplies" "WhatsAppVoiceReplies" NOT NULL DEFAULT 'auto';

-- CreateIndex
CREATE INDEX "Conversation_userId_updatedAt_idx" ON "Conversation"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

