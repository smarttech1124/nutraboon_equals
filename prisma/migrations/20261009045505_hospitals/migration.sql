-- CreateEnum
CREATE TYPE "HospitalAppointmentStatus" AS ENUM ('booked', 'canceled', 'attended', 'no_show');

-- CreateEnum
CREATE TYPE "AccessConversationStatus" AS ENUM ('open', 'escalated', 'closed');

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "departmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "HospitalProfile" (
    "organizationId" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'draft',
    "description" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "area" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "state" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "phone" TEXT,
    "emergencyPhone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "registrationNumber" TEXT,
    "accessibility" TEXT[],
    "reviewNote" TEXT,
    "submittedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalProfile_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "HospitalDepartment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "slotMinutes" INTEGER NOT NULL DEFAULT 30,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "availability" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalAppointment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "status" "HospitalAppointmentStatus" NOT NULL DEFAULT 'booked',
    "needs" TEXT[],
    "note" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessConversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "status" "AccessConversationStatus" NOT NULL DEFAULT 'open',
    "category" TEXT NOT NULL DEFAULT 'general',
    "departmentId" TEXT,
    "summary" TEXT,
    "needsDoctor" BOOLEAN NOT NULL DEFAULT false,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "assignedUserId" TEXT,
    "closedAt" TIMESTAMP(3),
    "deleteAfter" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "senderUserId" TEXT,
    "text" TEXT NOT NULL,
    "inputMode" TEXT NOT NULL DEFAULT 'text',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeocodeCache" (
    "query" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeocodeCache_pkey" PRIMARY KEY ("query")
);

-- CreateIndex
CREATE INDEX "HospitalProfile_status_state_idx" ON "HospitalProfile"("status", "state");

-- CreateIndex
CREATE INDEX "HospitalDepartment_organizationId_idx" ON "HospitalDepartment"("organizationId");

-- CreateIndex
CREATE INDEX "HospitalAppointment_organizationId_startsAt_idx" ON "HospitalAppointment"("organizationId", "startsAt");

-- CreateIndex
CREATE INDEX "HospitalAppointment_patientId_startsAt_idx" ON "HospitalAppointment"("patientId", "startsAt");

-- CreateIndex
CREATE INDEX "HospitalAppointment_status_startsAt_idx" ON "HospitalAppointment"("status", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccessConversation_appointmentId_key" ON "AccessConversation"("appointmentId");

-- CreateIndex
CREATE INDEX "AccessConversation_organizationId_status_updatedAt_idx" ON "AccessConversation"("organizationId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "AccessConversation_patientId_updatedAt_idx" ON "AccessConversation"("patientId", "updatedAt");

-- CreateIndex
CREATE INDEX "AccessConversation_deleteAfter_idx" ON "AccessConversation"("deleteAfter");

-- CreateIndex
CREATE INDEX "AccessMessage_conversationId_createdAt_idx" ON "AccessMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "HospitalProfile" ADD CONSTRAINT "HospitalProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalDepartment" ADD CONSTRAINT "HospitalDepartment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalAppointment" ADD CONSTRAINT "HospitalAppointment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalAppointment" ADD CONSTRAINT "HospitalAppointment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "HospitalDepartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalAppointment" ADD CONSTRAINT "HospitalAppointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessConversation" ADD CONSTRAINT "AccessConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessConversation" ADD CONSTRAINT "AccessConversation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessConversation" ADD CONSTRAINT "AccessConversation_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "HospitalAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessMessage" ADD CONSTRAINT "AccessMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AccessConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
