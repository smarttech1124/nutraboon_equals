-- CreateEnum
CREATE TYPE "PlannerSessionStatus" AS ENUM ('intake', 'ready', 'blocked', 'done');

-- CreateEnum
CREATE TYPE "MealPlanStatus" AS ENUM ('active', 'archived');

-- CreateTable
CREATE TABLE "PlannerSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "PlannerSessionStatus" NOT NULL DEFAULT 'intake',
    "facts" JSONB NOT NULL DEFAULT '{}',
    "messages" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "facts" JSONB NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "status" "MealPlanStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPlanWeek" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "weekIndex" INTEGER NOT NULL,
    "days" JSONB NOT NULL,
    "nutrition" JSONB,
    "shopping" JSONB,
    "adjustments" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT,
    "promptVersion" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealPlanWeek_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlannerSession_userId_updatedAt_idx" ON "PlannerSession"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MealPlan_sessionId_key" ON "MealPlan"("sessionId");

-- CreateIndex
CREATE INDEX "MealPlan_userId_createdAt_idx" ON "MealPlan"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MealPlanWeek_planId_weekIndex_key" ON "MealPlanWeek"("planId", "weekIndex");

-- AddForeignKey
ALTER TABLE "PlannerSession" ADD CONSTRAINT "PlannerSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PlannerSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlanWeek" ADD CONSTRAINT "MealPlanWeek_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MealPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
