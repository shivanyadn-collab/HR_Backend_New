-- AlterTable
ALTER TABLE "employee_assets" ADD COLUMN "issuanceDcNumber" TEXT;

-- CreateIndex (unique for server-generated DC numbers)
CREATE UNIQUE INDEX "employee_assets_issuanceDcNumber_key" ON "employee_assets"("issuanceDcNumber");
