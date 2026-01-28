import { Injectable, NotFoundException, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { WhatsAppService } from '../whatsapp/whatsapp.service'
import { CreateWhatsAppNotificationDto } from './dto/create-whatsapp-notification.dto'
import { UpdateWhatsAppNotificationDto } from './dto/update-whatsapp-notification.dto'

@Injectable()
export class WhatsAppNotificationsService {
  private readonly logger = new Logger(WhatsAppNotificationsService.name)

  constructor(
    private prisma: PrismaService,
    private whatsAppService: WhatsAppService,
  ) {}

  async create(createDto: CreateWhatsAppNotificationDto, createdBy: string) {
    const notification = await this.prisma.whatsAppNotification.create({
      data: {
        message: createDto.message,
        targetAudience: createDto.targetAudience,
        targetDetails: createDto.targetDetails,
        templateId: createDto.templateId,
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
        { message: { contains: search, mode: 'insensitive' } },
        { targetAudience: { contains: search, mode: 'insensitive' } },
      ]
    }

    const notifications = await this.prisma.whatsAppNotification.findMany({
      where,
      orderBy: {
        createdDate: 'desc',
      },
    })

    return notifications.map((notification) => this.formatResponse(notification))
  }

  async findOne(id: string) {
    const notification = await this.prisma.whatsAppNotification.findUnique({
      where: { id },
    })

    if (!notification) {
      throw new NotFoundException('WhatsApp notification not found')
    }

    return this.formatResponse(notification)
  }

  async update(id: string, updateDto: UpdateWhatsAppNotificationDto) {
    const notification = await this.prisma.whatsAppNotification.findUnique({
      where: { id },
    })

    if (!notification) {
      throw new NotFoundException('WhatsApp notification not found')
    }

    const updated = await this.prisma.whatsAppNotification.update({
      where: { id },
      data: {
        ...(updateDto.message && { message: updateDto.message }),
        ...(updateDto.targetAudience && { targetAudience: updateDto.targetAudience }),
        ...(updateDto.targetDetails !== undefined && { targetDetails: updateDto.targetDetails }),
        ...(updateDto.templateId !== undefined && { templateId: updateDto.templateId }),
        ...(updateDto.scheduledDate && {
          scheduledDate: new Date(updateDto.scheduledDate),
          status: 'SCHEDULED',
        }),
      },
    })

    return this.formatResponse(updated)
  }

  async remove(id: string) {
    const notification = await this.prisma.whatsAppNotification.findUnique({
      where: { id },
    })

    if (!notification) {
      throw new NotFoundException('WhatsApp notification not found')
    }

    await this.prisma.whatsAppNotification.delete({
      where: { id },
    })
  }

  /**
   * Send WhatsApp notification to target employees
   */
  async send(id: string) {
    const notification = await this.prisma.whatsAppNotification.findUnique({
      where: { id },
    })

    if (!notification) {
      throw new NotFoundException('WhatsApp notification not found')
    }

    if (notification.status === 'SENT') {
      throw new Error('WhatsApp notification has already been sent')
    }

    try {
      // Get target employees' phone numbers
      const phoneNumbers = await this.getTargetPhoneNumbers(
        notification.targetAudience,
        notification.targetDetails,
      )

      this.logger.log(`Sending WhatsApp notification ${id} to ${phoneNumbers.length} recipients`)

      if (phoneNumbers.length === 0) {
        throw new Error('No recipients found for the target audience')
      }

      // Send WhatsApp messages
      const result = await this.whatsAppService.sendBulkWhatsApp(
        phoneNumbers,
        notification.message,
        notification.templateId || undefined,
      )

      this.logger.log(
        `WhatsApp notification ${id} sent: ${result.success} success, ${result.failed} failed`,
      )

      // Update notification status
      const updated = await this.prisma.whatsAppNotification.update({
        where: { id },
        data: {
          status: result.failed === phoneNumbers.length ? 'FAILED' : 'SENT',
          sentDate: new Date(),
          sentCount: phoneNumbers.length,
          deliveredCount: result.success,
        },
      })

      return {
        ...this.formatResponse(updated),
        sendResult: {
          total: phoneNumbers.length,
          success: result.success,
          failed: result.failed,
          errors: result.errors.slice(0, 10), // Limit errors to first 10
        },
      }
    } catch (error: any) {
      this.logger.error(`Failed to send WhatsApp notification ${id}: ${error.message}`)

      // Update status to FAILED
      await this.prisma.whatsAppNotification.update({
        where: { id },
        data: {
          status: 'FAILED',
        },
      })

      throw error
    }
  }

  /**
   * Get target employee phone numbers based on audience type
   * Fetches phone from EmployeeMaster
   */
  private async getTargetPhoneNumbers(
    targetAudience: string,
    targetDetails?: string | null,
  ): Promise<string[]> {
    const employeeWhere: any = {
      status: 'ACTIVE',
    }

    switch (targetAudience) {
      case 'ALL_EMPLOYEES':
        this.logger.log('Fetching all employee phone numbers')
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
            this.logger.log(`Fetching phone numbers for department: ${department.departmentName}`)
          } else {
            this.logger.warn(`Department not found: ${targetDetails}`)
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
            employeeWhere.designationId = designation.id
            this.logger.log(`Fetching phone numbers for designation: ${designation.designationName}`)
          } else {
            this.logger.warn(`Designation not found: ${targetDetails}`)
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
            // Get employees assigned to this project through UserProject
            const userProjects = await this.prisma.userProject.findMany({
              where: { projectId: project.id },
              select: { userId: true },
            })

            const userIds = userProjects.map((up) => up.userId)

            // Get employees linked to these users
            const employees = await this.prisma.employeeMaster.findMany({
              where: {
                status: 'ACTIVE',
                userId: { in: userIds },
              },
              select: { phone: true },
            })

            return employees
              .map((e) => e.phone)
              .filter((phone): phone is string => phone !== null && phone.trim() !== '')
          } else {
            this.logger.warn(`Project not found: ${targetDetails}`)
            return []
          }
        }
        break

      case 'INDIVIDUAL':
        if (targetDetails) {
          // Find employee by phone number or employee code
          const employee = await this.prisma.employeeMaster.findFirst({
            where: {
              OR: [
                { phone: { equals: targetDetails } },
                { employeeCode: { equals: targetDetails, mode: 'insensitive' } },
              ],
              status: 'ACTIVE',
            },
            select: { phone: true },
          })

          if (employee?.phone) {
            return [employee.phone]
          } else {
            this.logger.warn(`Employee not found: ${targetDetails}`)
            return []
          }
        }
        break

      default:
        this.logger.warn(`Unknown target audience: ${targetAudience}`)
        return []
    }

    // Get all employees based on filter
    const employees = await this.prisma.employeeMaster.findMany({
      where: employeeWhere,
      select: { phone: true },
    })

    const phoneNumbers = employees
      .map((e) => e.phone)
      .filter((phone): phone is string => phone !== null && phone.trim() !== '')
    this.logger.log(`Found ${phoneNumbers.length} phone numbers`)

    return phoneNumbers
  }

  private formatResponse(notification: any) {
    return {
      id: notification.id,
      message: notification.message,
      targetAudience: notification.targetAudience,
      targetDetails: notification.targetDetails,
      templateId: notification.templateId,
      scheduledDate: notification.scheduledDate?.toISOString(),
      sentDate: notification.sentDate?.toISOString(),
      status: notification.status,
      sentCount: notification.sentCount,
      deliveredCount: notification.deliveredCount,
      readCount: notification.readCount,
      createdBy: notification.createdBy,
      createdDate: notification.createdDate.toISOString().split('T')[0],
    }
  }
}
