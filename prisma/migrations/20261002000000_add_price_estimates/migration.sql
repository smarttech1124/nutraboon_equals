-- CreateEnum
CREATE TYPE "UnitMeasure" AS ENUM ('g', 'ml', 'piece');

-- CreateEnum
CREATE TYPE "PriceRegion" AS ENUM ('national', 'north_central', 'north_east', 'north_west', 'south_east', 'south_south', 'south_west');

-- CreateTable
CREATE TABLE "PriceItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitLabel" TEXT NOT NULL,
    "unitQuantity" DOUBLE PRECISION NOT NULL,
    "unitMeasure" "UnitMeasure" NOT NULL,
    "unitEvidence" TEXT NOT NULL,
    "sourceItemLabel" TEXT NOT NULL,

    CONSTRAINT "PriceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceItemAlias" (
    "alias" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,

    CONSTRAINT "PriceItemAlias_pkey" PRIMARY KEY ("alias")
);

-- CreateTable
CREATE TABLE "PriceEstimate" (
    "id" SERIAL NOT NULL,
    "itemId" TEXT NOT NULL,
    "region" "PriceRegion" NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "retrievedAt" DATE NOT NULL,

    CONSTRAINT "PriceEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceItemAlias_itemId_idx" ON "PriceItemAlias"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceEstimate_itemId_region_effectiveDate_key" ON "PriceEstimate"("itemId", "region", "effectiveDate");

-- AddForeignKey
ALTER TABLE "PriceItemAlias" ADD CONSTRAINT "PriceItemAlias_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PriceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceEstimate" ADD CONSTRAINT "PriceEstimate_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PriceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
