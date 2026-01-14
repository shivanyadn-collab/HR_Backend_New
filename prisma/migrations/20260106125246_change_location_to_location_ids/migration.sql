/*
  Warnings:

  - You are about to drop the column `locationId` on the `project_categories` table. All the data in the column will be lost.

*/
-- Step 1: Add the new locationIds column
ALTER TABLE "project_categories" ADD COLUMN "locationIds" TEXT[];

-- Step 2: Migrate data from locationId to locationIds
UPDATE "project_categories" 
SET "locationIds" = CASE 
  WHEN "locationId" IS NOT NULL THEN ARRAY["locationId"]
  ELSE ARRAY[]::TEXT[]
END;

-- Step 3: Drop the foreign key constraint
ALTER TABLE "project_categories" DROP CONSTRAINT IF EXISTS "project_categories_locationId_fkey";

-- Step 4: Drop the old locationId column
ALTER TABLE "project_categories" DROP COLUMN "locationId";
