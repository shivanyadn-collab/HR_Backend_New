-- CreateEnum
CREATE TYPE "LeaveSession" AS ENUM ('FULL_DAY', 'FIRST_HALF', 'SECOND_HALF');

-- AlterTable
ALTER TABLE "leave_applications" ADD COLUMN     "attachmentName" TEXT,
ADD COLUMN     "attachmentUrl" TEXT,
ADD COLUMN     "leaveSession" "LeaveSession" NOT NULL DEFAULT 'FULL_DAY',
ALTER COLUMN "totalDays" SET DATA TYPE DOUBLE PRECISION;
