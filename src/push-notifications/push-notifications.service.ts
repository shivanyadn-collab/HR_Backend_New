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
      // Get target user FCM tokens based on target audience
      const tokens = await this.getTargetUserTokens(
        notification.targetAudience,
        notification.targetDetails,
      )

      if (tokens.length === 0) {
        throw new Error('No valid FCM tokens found for target audience')
      }

      // Send FCM notification
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

      // Update notification status
      const updated = await this.prisma.pushNotification.update({
        where: { id },
        data: {
          status: 'SENT',
          sentDate: new Date(),
          sentCount: fcmResponse.successCount,
        },
      })

      this.logger.log(
        `Sent push notification ${id} to ${fcmResponse.successCount} devices, ${fcmResponse.failureCount} failed`,
      )

      return {
        ...this.formatResponse(updated),
        fcmResponse: {
          successCount: fcmResponse.successCount,
          failureCount: fcmResponse.failureCount,
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
   * Get FCM tokens for target users based on audience
   */
  private async getTargetUserTokens(
    targetAudience: string,
    targetDetails?: string | null,
  ): Promise<string[]> {
    const where: any = {
      isActive: true,
      fcmToken: {
        not: null,
      },
    }

    switch (targetAudience) {
      case 'ALL_EMPLOYEES':
        // Get all active users with FCM tokens
        break

      case 'DEPARTMENT':
        if (targetDetails) {
          // Find users by department
          const department = await this.prisma.department.findFirst({
            where: {
              OR: [
                { departmentName: { equals: targetDetails, mode: 'insensitive' } },
                { departmentCode: { equals: targetDetails, mode: 'insensitive' } },
              ],
            },
          })

          if (department) {
            // Get users through EmployeeMaster
            const employees = await this.prisma.employeeMaster.findMany({
              where: {
                departmentId: department.id,
                status: 'ACTIVE',
              },
              select: { userId: true },
            })

            const userIds = employees
              .map((emp) => emp.userId)
              .filter((id): id is string => id !== null)

            if (userIds.length > 0) {
              where.id = { in: userIds }
            } else {
              return []
            }
          } else {
            return []
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
            const employees = await this.prisma.employeeMaster.findMany({
              where: {
                designationId: designation.id,
                status: 'ACTIVE',
              },
              select: { userId: true },
            })

            const userIds = employees
              .map((emp) => emp.userId)
              .filter((id): id is string => id !== null)

            if (userIds.length > 0) {
              where.id = { in: userIds }
            } else {
              return []
            }
          } else {
            return []
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
            // Get users through UserProject
            const userProjects = await this.prisma.userProject.findMany({
              where: { projectId: project.id },
              select: { userId: true },
            })

            const userIds = userProjects.map((up) => up.userId)

            if (userIds.length > 0) {
              where.id = { in: userIds }
            } else {
              return []
            }
          } else {
            return []
          }
        }
        break

      case 'INDIVIDUAL':
        if (targetDetails) {
          // Find user by email or employeeId
          const user = await this.prisma.user.findFirst({
            where: {
              OR: [
                { email: { equals: targetDetails, mode: 'insensitive' } },
                { employeeId: { equals: targetDetails, mode: 'insensitive' } },
              ],
            },
          })

          if (user) {
            where.id = user.id
          } else {
            return []
          }
        }
        break

      default:
        return []
    }

    // Get users with FCM tokens
    const users = await this.prisma.user.findMany({
      where,
      select: { fcmToken: true },
    })

    // Filter out null tokens
    return users
      .map((user) => user.fcmToken)
      .filter((token): token is string => token !== null && token !== undefined)
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
