import { Injectable, NotFoundException, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { FirebaseService } from '../firebase/firebase.service'
import { CreatePushNotificationDto } from './dto/create-push-notification.dto'
import { UpdatePushNotificationDto } from './dto/update-push-notification.dto'

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name)

  constructor(
    private prisma: PrismaService,
    private firebaseService: FirebaseService,
  ) {}

  async create(createDto: CreatePushNotificationDto, createdBy: string) {
    const notification = await this.prisma.pushNotification.create({
      data: {
        title: createDto.title,
        message: createDto.message,
        targetAudience: createDto.targetAudience,
        targetDetails: createDto.targetDetails,
        priority: createDto.priority,
        scheduledDate: createDto.scheduledDate ? new Date(createDto.scheduledDate) : null,
        status: createDto.scheduledDate ? 'SCHEDULED' : 'DRAFT',
        createdBy,
      },
    })

    return this.formatResponse(notification)
  }

  async findAll(status?: string, search?: string) {
    const where: any = {}

    if (status && status !== 'all') {
      where.status = status.toUpperCase()
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { message: { contains: search, mode: 'insensitive' } },
        { targetAudience: { contains: search, mode: 'insensitive' } },
      ]
    }

    const notifications = await this.prisma.pushNotification.findMany({
      where,
      orderBy: {
        createdDate: 'desc',
      },
    })

    return notifications.map((notification) => this.formatResponse(notification))
  }

  async findOne(id: string) {
    const notification = await this.prisma.pushNotification.findUnique({
      where: { id },
    })

    if (!notification) {
      throw new NotFoundException('Push notification not found')
    }

    return this.formatResponse(notification)
  }

  async update(id: string, updateDto: UpdatePushNotificationDto) {
    const notification = await this.prisma.pushNotification.findUnique({
      where: { id },
    })

    if (!notification) {
      throw new NotFoundException('Push notification not found')
    }

    const updated = await this.prisma.pushNotification.update({
      where: { id },
      data: {
        ...(updateDto.title && { title: updateDto.title }),
        ...(updateDto.message && { message: updateDto.message }),
        ...(updateDto.targetAudience && { targetAudience: updateDto.targetAudience }),
        ...(updateDto.targetDetails !== undefined && { targetDetails: updateDto.targetDetails }),
        ...(updateDto.priority && { priority: updateDto.priority }),
        ...(updateDto.scheduledDate && {
          scheduledDate: new Date(updateDto.scheduledDate),
          status: 'SCHEDULED',
        }),
      },
    })

    return this.formatResponse(updated)
  }

  async remove(id: string) {
    const notification = await this.prisma.pushNotification.findUnique({
      where: { id },
    })

    if (!notification) {
      throw new NotFoundException('Push notification not found')
    }

    await this.prisma.pushNotification.delete({
      where: { id },
    })
  }

  /**
   * Send push notification via FCM
   */
  async send(id: string): Promise<any> {
    const notification = await this.prisma.pushNotification.findUnique({
      where: { id },
    })

    if (!notification) {
      throw new NotFoundException('Push notification not found')
    }

    if (notification.status === 'SENT') {
      throw new Error('Notification has already been sent')
    }

    try {
      // Get target users and their FCM tokens based on target audience
      this.logger.log(`Getting target users for notification ${id}, audience: ${notification.targetAudience}, details: ${notification.targetDetails}`)
      
      const { tokens, employees } = await this.getTargetUsersAndTokens(
        notification.targetAudience,
        notification.targetDetails,
      )

      this.logger.log(`Found ${employees.length} employees and ${tokens.length} FCM tokens for notification ${id}`)

      // Create employee notification records for all target employees
      if (employees.length > 0) {
        this.logger.log(`Creating employee notification records for: ${JSON.stringify(employees)}`)
        
        const createResult = await this.prisma.employeeNotification.createMany({
          data: employees.map((emp) => ({
            employeeId: emp.employeeId,
            userId: emp.userId,
            pushNotificationId: notification.id,
            title: notification.title,
            message: notification.message,
            type: 'PUSH',
            category: 'General',
            priority: notification.priority,
            isRead: false,
            sentAt: new Date(),
          })),
          skipDuplicates: true,
        })

        this.logger.log(`Created ${createResult.count} employee notification records for push notification ${id}`)
      } else {
        this.logger.warn(`No employees found for notification ${id} with audience ${notification.targetAudience}`)
      }

      let fcmSuccessCount = 0
      let fcmFailureCount = 0

      // Send FCM notification only if there are valid tokens
      if (tokens.length > 0) {
        const fcmResponse = await this.firebaseService.sendToDevices(
          tokens,
          {
            title: notification.title,
            body: notification.message,
          },
          {
            notificationId: notification.id,
            type: 'push_notification',
          },
        )
        fcmSuccessCount = fcmResponse.successCount
        fcmFailureCount = fcmResponse.failureCount
      }

      // Update notification status
      const updated = await this.prisma.pushNotification.update({
        where: { id },
        data: {
          status: 'SENT',
          sentDate: new Date(),
          sentCount: employees.length, // Total employees notified
        },
      })

      this.logger.log(
        `Sent push notification ${id} to ${employees.length} employees, FCM: ${fcmSuccessCount} success, ${fcmFailureCount} failed`,
      )

      return {
        ...this.formatResponse(updated),
        fcmResponse: {
          successCount: fcmSuccessCount,
          failureCount: fcmFailureCount,
          totalEmployees: employees.length,
        },
      }
    } catch (error: any) {
      // Update status to FAILED
      await this.prisma.pushNotification.update({
        where: { id },
        data: {
          status: 'FAILED',
        },
      })

      this.logger.error(`Failed to send push notification ${id}: ${error.message}`, error)
      throw error
    }
  }

  /**
   * Get FCM tokens and employee info for target users based on audience
   */
  private async getTargetUsersAndTokens(
    targetAudience: string,
    targetDetails?: string | null,
  ): Promise<{ tokens: string[]; employees: { employeeId: string; userId: string | null }[] }> {
    this.logger.log(`getTargetUsersAndTokens called with audience: ${targetAudience}, details: ${targetDetails}`)
    
    const userWhere: any = {
      isActive: true,
    }
    const employeeWhere: any = {
      status: 'ACTIVE',
    }

    switch (targetAudience) {
      case 'ALL_EMPLOYEES':
        // Get all active employees
        this.logger.log('Fetching ALL_EMPLOYEES')
        break

      case 'DEPARTMENT':
        if (targetDetails) {
          const department = await this.prisma.department.findFirst({
            where: {
              OR: [
                { departmentName: { equals: targetDetails, mode: 'insensitive' } },
                { departmentCode: { equals: targetDetails, mode: 'insensitive' } },
              ],
            },
          })

          if (department) {
            employeeWhere.departmentId = department.id
          } else {
            return { tokens: [], employees: [] }
          }
        }
        break

      case 'DESIGNATION':
        if (targetDetails) {
          const designation = await this.prisma.designation.findFirst({
            where: {
              OR: [
                { designationName: { equals: targetDetails, mode: 'insensitive' } },
                { designationCode: { equals: targetDetails, mode: 'insensitive' } },
              ],
            },
          })

          if (designation) {
            employeeWhere.designationId = designation.id
          } else {
            return { tokens: [], employees: [] }
          }
        }
        break

      case 'PROJECT':
        if (targetDetails) {
          const project = await this.prisma.project.findFirst({
            where: {
              OR: [
                { name: { equals: targetDetails, mode: 'insensitive' } },
                { code: { equals: targetDetails, mode: 'insensitive' } },
              ],
            },
          })

          if (project) {
            // Get employees through UserProject and EmployeeAssignment
            const userProjects = await this.prisma.userProject.findMany({
              where: { projectId: project.id },
              select: { userId: true },
            })

            const userIds = userProjects.map((up) => up.userId)

            // Get employee masters linked to these users
            const employees = await this.prisma.employeeMaster.findMany({
              where: {
                status: 'ACTIVE',
                userId: { in: userIds },
              },
              select: { id: true, userId: true },
            })

            const tokens = await this.prisma.user.findMany({
              where: {
                id: { in: userIds },
                isActive: true,
                fcmToken: { not: null },
              },
              select: { fcmToken: true },
            })

            return {
              tokens: tokens.map((u) => u.fcmToken).filter((t): t is string => t !== null),
              employees: employees.map((e) => ({ employeeId: e.id, userId: e.userId })),
            }
          } else {
            return { tokens: [], employees: [] }
          }
        }
        break

      case 'INDIVIDUAL':
        if (targetDetails) {
          // Find employee by email or employeeCode
          const employee = await this.prisma.employeeMaster.findFirst({
            where: {
              OR: [
                { email: { equals: targetDetails, mode: 'insensitive' } },
                { employeeCode: { equals: targetDetails, mode: 'insensitive' } },
              ],
              status: 'ACTIVE',
            },
            select: { id: true, userId: true },
          })

          if (employee) {
            let token: string | null = null
            if (employee.userId) {
              const user = await this.prisma.user.findUnique({
                where: { id: employee.userId },
                select: { fcmToken: true },
              })
              token = user?.fcmToken || null
            }

            return {
              tokens: token ? [token] : [],
              employees: [{ employeeId: employee.id, userId: employee.userId }],
            }
          } else {
            return { tokens: [], employees: [] }
          }
        }
        break

      default:
        this.logger.warn(`Unknown target audience: ${targetAudience}`)
        return { tokens: [], employees: [] }
    }

    // Get all employees based on filter
    this.logger.log(`Fetching employees with filter: ${JSON.stringify(employeeWhere)}`)
    const employees = await this.prisma.employeeMaster.findMany({
      where: employeeWhere,
      select: { id: true, userId: true },
    })

    this.logger.log(`Found ${employees.length} employees matching filter`)

    // Get user IDs that have employees
    const userIds = employees
      .map((emp) => emp.userId)
      .filter((id): id is string => id !== null)

    this.logger.log(`Found ${userIds.length} user IDs linked to employees`)

    // Get FCM tokens for these users
    const tokens: string[] = []
    if (userIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: {
          ...userWhere,
          id: { in: userIds },
          fcmToken: { not: null },
        },
        select: { fcmToken: true },
      })

      tokens.push(...users.map((u) => u.fcmToken).filter((t): t is string => t !== null))
      this.logger.log(`Found ${tokens.length} FCM tokens`)
    }

    return {
      tokens,
      employees: employees.map((e) => ({ employeeId: e.id, userId: e.userId })),
    }
  }

  /**
   * Get notifications for a specific employee
   */
  async getEmployeeNotifications(employeeId: string, unreadOnly?: boolean) {
    const where: any = {
      employeeId,
    }

    if (unreadOnly) {
      where.isRead = false
    }

    const notifications = await this.prisma.employeeNotification.findMany({
      where,
      orderBy: { sentAt: 'desc' },
      take: 50, // Limit to 50 most recent
    })

    return notifications.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      category: n.category,
      priority: n.priority,
      isRead: n.isRead,
      readAt: n.readAt?.toISOString(),
      sentAt: n.sentAt.toISOString(),
      createdAt: n.createdAt.toISOString(),
    }))
  }

  /**
   * Get notifications for a specific user (by userId)
   */
  async getUserNotifications(userId: string, unreadOnly?: boolean) {
    this.logger.log(`Fetching notifications for userId: ${userId}`)
    
    // First find the employee master for this user
    const employee = await this.prisma.employeeMaster.findFirst({
      where: { userId },
    })

    this.logger.log(`Found employee for user ${userId}: ${employee?.id || 'none'}`)

    // Build OR conditions to find notifications by either employeeId or userId
    const orConditions: any[] = []
    
    if (employee) {
      orConditions.push({ employeeId: employee.id })
    }
    orConditions.push({ userId: userId })

    const where: any = {
      OR: orConditions,
    }

    if (unreadOnly) {
      where.isRead = false
    }

    const notifications = await this.prisma.employeeNotification.findMany({
      where,
      orderBy: { sentAt: 'desc' },
      take: 50,
    })

    this.logger.log(`Found ${notifications.length} notifications for user ${userId}`)

    return notifications.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      category: n.category,
      priority: n.priority,
      isRead: n.isRead,
      readAt: n.readAt?.toISOString(),
      sentAt: n.sentAt.toISOString(),
      createdAt: n.createdAt.toISOString(),
    }))
  }

  /**
   * Mark a notification as read
   */
  async markNotificationAsRead(notificationId: string, employeeId?: string) {
    const where: any = { id: notificationId }
    if (employeeId) {
      where.employeeId = employeeId
    }

    const notification = await this.prisma.employeeNotification.findFirst({
      where,
    })

    if (!notification) {
      throw new NotFoundException('Notification not found')
    }

    const updated = await this.prisma.employeeNotification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    })

    // Update read count on the push notification
    if (notification.pushNotificationId) {
      await this.prisma.pushNotification.update({
        where: { id: notification.pushNotificationId },
        data: {
          readCount: {
            increment: 1,
          },
        },
      })
    }

    return {
      id: updated.id,
      isRead: updated.isRead,
      readAt: updated.readAt?.toISOString(),
    }
  }

  /**
   * Mark all notifications as read for an employee
   */
  async markAllNotificationsAsRead(employeeId: string) {
    const result = await this.prisma.employeeNotification.updateMany({
      where: {
        employeeId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    })

    return { updatedCount: result.count }
  }

  /**
   * Get unread notification count for an employee
   */
  async getUnreadCount(employeeId: string) {
    const count = await this.prisma.employeeNotification.count({
      where: {
        employeeId,
        isRead: false,
      },
    })

    return { unreadCount: count }
  }

  /**
   * Debug method to check user-employee-notification mapping
   */
  async debugUserNotifications(userId: string) {
    // Find employee for this user
    const employee = await this.prisma.employeeMaster.findFirst({
      where: { userId },
      select: { id: true, employeeCode: true, firstName: true, lastName: true, userId: true },
    })

    // Count total employee notifications
    const totalNotifications = await this.prisma.employeeNotification.count()

    // Find notifications by userId
    const notificationsByUserId = await this.prisma.employeeNotification.findMany({
      where: { userId },
      take: 5,
    })

    // Find notifications by employeeId (if employee found)
    let notificationsByEmployeeId: any[] = []
    if (employee) {
      notificationsByEmployeeId = await this.prisma.employeeNotification.findMany({
        where: { employeeId: employee.id },
        take: 5,
      })
    }

    // Get sample of all employee notifications to verify data
    const sampleNotifications = await this.prisma.employeeNotification.findMany({
      take: 5,
      select: { id: true, employeeId: true, userId: true, title: true },
    })

    return {
      providedUserId: userId,
      employeeFound: employee,
      totalEmployeeNotifications: totalNotifications,
      notificationsByUserId: notificationsByUserId.length,
      notificationsByEmployeeId: notificationsByEmployeeId.length,
      sampleNotifications,
    }
  }

  /**
   * Process scheduled notifications that are due
   * This method should be called periodically (e.g., every minute via cron)
   */
  async processScheduledNotifications(): Promise<{ processed: number; failed: number }> {
    const now = new Date()
    
    // Find all scheduled notifications that are due
    const dueNotifications = await this.prisma.pushNotification.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledDate: {
          lte: now,
        },
      },
    })

    this.logger.log(`Found ${dueNotifications.length} scheduled notifications to process`)

    let processed = 0
    let failed = 0

    for (const notification of dueNotifications) {
      try {
        await this.send(notification.id)
        processed++
        this.logger.log(`Successfully sent scheduled notification ${notification.id}`)
      } catch (error: any) {
        failed++
        this.logger.error(`Failed to send scheduled notification ${notification.id}: ${error.message}`)
      }
    }

    return { processed, failed }
  }

  /**
   * Start the scheduled notification processor
   * Runs every minute to check for due notifications
   */
  startScheduler(intervalMs: number = 60000): NodeJS.Timeout {
    this.logger.log(`Starting scheduled notification processor (interval: ${intervalMs}ms)`)
    
    const intervalId = setInterval(async () => {
      try {
        const result = await this.processScheduledNotifications()
        if (result.processed > 0 || result.failed > 0) {
          this.logger.log(`Scheduler run complete: ${result.processed} processed, ${result.failed} failed`)
        }
      } catch (error: any) {
        this.logger.error(`Scheduler error: ${error.message}`)
      }
    }, intervalMs)

    // Also run immediately
    this.processScheduledNotifications().catch((error) => {
      this.logger.error(`Initial scheduler run error: ${error.message}`)
    })

    return intervalId
  }

  private formatResponse(notification: any) {
    return {
      id: notification.id,
      title: notification.title,
      message: notification.message,
      targetAudience: notification.targetAudience,
      targetDetails: notification.targetDetails,
      priority: notification.priority,
      scheduledDate: notification.scheduledDate?.toISOString(),
      sentDate: notification.sentDate?.toISOString(),
      status: notification.status,
      sentCount: notification.sentCount,
      readCount: notification.readCount,
      createdBy: notification.createdBy,
      createdDate: notification.createdDate.toISOString().split('T')[0],
    }
  }
}
