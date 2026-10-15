-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "FoodCategory" AS ENUM ('fruit', 'vegetable', 'grain', 'legume', 'nut_seed', 'tuber', 'egg', 'meat', 'fish', 'dairy', 'oil');

-- CreateTable
CREATE TABLE "Food" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "FoodCategory" NOT NULL,
    "scientificName" TEXT,
    "allergens" TEXT[],
    "energyKcal" DOUBLE PRECISION,
    "energyKj" DOUBLE PRECISION,
    "waterG" DOUBLE PRECISION,
    "proteinG" DOUBLE PRECISION,
    "fatG" DOUBLE PRECISION,
    "carbohydrateG" DOUBLE PRECISION,
    "fiberG" DOUBLE PRECISION,
    "calciumMg" DOUBLE PRECISION,
    "ironMg" DOUBLE PRECISION,
    "potassiumMg" DOUBLE PRECISION,
    "sodiumMg" DOUBLE PRECISION,
    "zincMg" DOUBLE PRECISION,
    "vitaminARaeMcg" DOUBLE PRECISION,
    "vitaminCMg" DOUBLE PRECISION,
    "folateDfeMcg" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "sourceFoodCode" TEXT NOT NULL,
    "sourceFoodName" TEXT NOT NULL,
    "retrievedAt" DATE NOT NULL,
    "servingLabel" TEXT,
    "servingGrams" DOUBLE PRECISION,
    "servingSource" TEXT,
    "servingSourceUrl" TEXT,
    "servingSourceVersion" TEXT,
    "servingSourceRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Food_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodAlias" (
    "alias" TEXT NOT NULL,
    "foodId" TEXT NOT NULL,

    CONSTRAINT "FoodAlias_pkey" PRIMARY KEY ("alias")
);

-- CreateIndex
CREATE INDEX "FoodAlias_foodId_idx" ON "FoodAlias"("foodId");

-- AddForeignKey
ALTER TABLE "FoodAlias" ADD CONSTRAINT "FoodAlias_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE CASCADE ON UPDATE CASCADE;
