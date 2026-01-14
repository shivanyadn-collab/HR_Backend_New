-- CreateEnum
CREATE TYPE "ShiftChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "shift_change_requests" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "employeeMasterId" TEXT NOT NULL,
    "currentShiftId" TEXT NOT NULL,
    "requestedShiftId" TEXT NOT NULL,
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ShiftChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedDate" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shift_change_requests_requestNumber_key" ON "shift_change_requests"("requestNumber");

-- AddForeignKey
ALTER TABLE "shift_change_requests" ADD CONSTRAINT "shift_change_requests_employeeMasterId_fkey" FOREIGN KEY ("employeeMasterId") REFERENCES "employee_masters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_change_requests" ADD CONSTRAINT "shift_change_requests_currentShiftId_fkey" FOREIGN KEY ("currentShiftId") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_change_requests" ADD CONSTRAINT "shift_change_requests_requestedShiftId_fkey" FOREIGN KEY ("requestedShiftId") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
