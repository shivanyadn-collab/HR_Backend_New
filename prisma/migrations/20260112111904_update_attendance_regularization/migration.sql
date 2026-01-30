-- CreateEnum
CREATE TYPE "RegularizationType" AS ENUM ('MISSED_PUNCH', 'ON_DUTY', 'WORK_FROM_HOME', 'OUTDOOR_DUTY', 'CLIENT_VISIT', 'HALF_DAY_CORRECTION');

-- AlterEnum
ALTER TYPE "RegularizationStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "attendance_regularizations" ADD COLUMN     "location" TEXT,
ADD COLUMN     "regularizationType" "RegularizationType" NOT NULL DEFAULT 'MISSED_PUNCH',
ADD COLUMN     "remarks" TEXT,
ALTER COLUMN "requestedCheckIn" DROP NOT NULL,
ALTER COLUMN "requestedCheckOut" DROP NOT NULL;
