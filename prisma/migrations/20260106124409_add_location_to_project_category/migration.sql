-- AlterTable
ALTER TABLE "project_categories" ADD COLUMN     "locationId" TEXT;

-- AddForeignKey
ALTER TABLE "project_categories" ADD CONSTRAINT "project_categories_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
