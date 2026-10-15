-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('draft', 'submitted', 'changes_requested', 'verified', 'rejected', 'suspended');

-- CreateEnum
CREATE TYPE "ProductAvailability" AS ENUM ('in_stock', 'limited', 'seasonal', 'out_of_stock');

-- CreateTable
CREATE TABLE "VendorProfile" (
    "organizationId" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'draft',
    "description" TEXT NOT NULL DEFAULT '',
    "categories" TEXT[],
    "website" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "state" TEXT,
    "city" TEXT NOT NULL DEFAULT '',
    "registrationNumber" TEXT,
    "logoPublicId" TEXT,
    "logoUrl" TEXT,
    "reviewNote" TEXT,
    "submittedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorProfile_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'draft',
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "benefits" TEXT NOT NULL DEFAULT '',
    "recommendedUse" TEXT NOT NULL DEFAULT '',
    "ingredients" TEXT[],
    "allergens" TEXT[],
    "matchTerms" TEXT[],
    "labelNutrition" JSONB,
    "availability" "ProductAvailability" NOT NULL DEFAULT 'in_stock',
    "purchaseLocations" JSONB NOT NULL DEFAULT '[]',
    "priceNaira" INTEGER,
    "imagePublicId" TEXT,
    "imageUrl" TEXT,
    "reviewNote" TEXT,
    "submittedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductStat" (
    "productId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductStat_pkey" PRIMARY KEY ("productId","day")
);

-- CreateIndex
CREATE INDEX "VendorProfile_status_idx" ON "VendorProfile"("status");

-- CreateIndex
CREATE INDEX "Product_organizationId_idx" ON "Product"("organizationId");

-- CreateIndex
CREATE INDEX "Product_status_category_idx" ON "Product"("status", "category");

-- AddForeignKey
ALTER TABLE "VendorProfile" ADD CONSTRAINT "VendorProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStat" ADD CONSTRAINT "ProductStat_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
