-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accessibilityNeeds" TEXT[] DEFAULT ARRAY[]::TEXT[];
