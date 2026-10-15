-- CreateEnum
CREATE TYPE "NutritionistStatus" AS ENUM ('draft', 'submitted', 'changes_requested', 'verified', 'rejected', 'suspended');

-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('online', 'in_person');

-- CreateEnum
CREATE TYPE "QualificationKind" AS ENUM ('degree', 'certification', 'registration', 'membership');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('completed', 'failed', 'unavailable');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('requested', 'accepted', 'declined', 'canceled', 'completed');

-- CreateTable
CREATE TABLE "NutritionistProfile" (
    "userId" TEXT NOT NULL,
    "status" "NutritionistStatus" NOT NULL DEFAULT 'draft',
    "title" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "specializations" TEXT[],
    "expertise" TEXT[],
    "yearsExperience" INTEGER NOT NULL DEFAULT 0,
    "state" TEXT,
    "city" TEXT NOT NULL DEFAULT '',
    "sessionTypes" "SessionType"[],
    "sessionFeeMinor" INTEGER NOT NULL DEFAULT 0,
    "sessionMinutes" INTEGER NOT NULL DEFAULT 60,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "whatsapp" TEXT,
    "availability" JSONB NOT NULL DEFAULT '[]',
    "photoPublicId" TEXT,
    "photoUrl" TEXT,
    "reviewNote" TEXT,
    "submittedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionistProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Qualification" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "kind" "QualificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "year" INTEGER,
    "registrationNumber" TEXT,
    "expiresOn" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Qualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualificationDocument" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualificationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualificationAnalysis" (
    "id" SERIAL NOT NULL,
    "profileId" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL,
    "provider" TEXT,
    "promptVersion" TEXT NOT NULL,
    "checks" JSONB NOT NULL,
    "assessment" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualificationAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "nutritionistId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sessionType" "SessionType" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "feeMinor" INTEGER NOT NULL,
    "clientNote" TEXT,
    "recommendation" TEXT,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'requested',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NutritionistProfile_status_state_idx" ON "NutritionistProfile"("status", "state");

-- CreateIndex
CREATE INDEX "Qualification_profileId_idx" ON "Qualification"("profileId");

-- CreateIndex
CREATE INDEX "QualificationDocument_profileId_idx" ON "QualificationDocument"("profileId");

-- CreateIndex
CREATE INDEX "QualificationAnalysis_profileId_createdAt_idx" ON "QualificationAnalysis"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "Appointment_nutritionistId_startsAt_idx" ON "Appointment"("nutritionistId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_clientId_startsAt_idx" ON "Appointment"("clientId", "startsAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "NutritionistProfile" ADD CONSTRAINT "NutritionistProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Qualification" ADD CONSTRAINT "Qualification_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "NutritionistProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualificationDocument" ADD CONSTRAINT "QualificationDocument_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "NutritionistProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualificationAnalysis" ADD CONSTRAINT "QualificationAnalysis_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "NutritionistProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_nutritionistId_fkey" FOREIGN KEY ("nutritionistId") REFERENCES "NutritionistProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
