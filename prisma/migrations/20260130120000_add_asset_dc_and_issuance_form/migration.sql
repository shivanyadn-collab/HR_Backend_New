-- CreateEnum
CREATE TYPE "DeliveryChallanType" AS ENUM ('RETURNABLE', 'NON_RETURNABLE');

-- AlterTable
ALTER TABLE "employee_assets" ADD COLUMN "dcType" "DeliveryChallanType",
ADD COLUMN "issuanceFormKey" TEXT,
ADD COLUMN "issuanceFormUrl" TEXT;
