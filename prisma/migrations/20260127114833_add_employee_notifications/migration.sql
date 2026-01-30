-- CreateTable
CREATE TABLE "employee_notifications" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "userId" TEXT,
    "pushNotificationId" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PUSH',
    "category" TEXT NOT NULL DEFAULT 'General',
    "priority" "NotificationPriority" NOT NULL DEFAULT 'MEDIUM',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_notifications_employeeId_idx" ON "employee_notifications"("employeeId");

-- CreateIndex
CREATE INDEX "employee_notifications_userId_idx" ON "employee_notifications"("userId");

-- CreateIndex
CREATE INDEX "employee_notifications_isRead_idx" ON "employee_notifications"("isRead");

-- AddForeignKey
ALTER TABLE "employee_notifications" ADD CONSTRAINT "employee_notifications_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee_masters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_notifications" ADD CONSTRAINT "employee_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_notifications" ADD CONSTRAINT "employee_notifications_pushNotificationId_fkey" FOREIGN KEY ("pushNotificationId") REFERENCES "push_notifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
