import { Injectable, NotFoundException, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { MailService } from '../mail/mail.service'
import { CreateEmailAlertDto } from './dto/create-email-alert.dto'
import { UpdateEmailAlertDto } from './dto/update-email-alert.dto'

@Injectable()
export class EmailAlertsService {
  private readonly logger = new Logger(EmailAlertsService.name)

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  async create(createDto: CreateEmailAlertDto, createdBy: string) {
    const alert = await this.prisma.emailAlert.create({
      data: {
        subject: createDto.subject,
        emailBody: createDto.emailBody,
        targetAudience: createDto.targetAudience,
        targetDetails: createDto.targetDetails || null,
        templateId: createDto.templateId || null, // Only set if valid, otherwise null
        scheduledDate: createDto.scheduledDate ? new Date(createDto.scheduledDate) : null,
        status: createDto.scheduledDate ? 'SCHEDULED' : 'DRAFT',
        createdBy,
      },
    })

    return this.formatResponse(alert)
  }

  async findAll(status?: string, search?: string) {
    const where: any = {}

    if (status && status !== 'all') {
      where.status = status.toUpperCase()
    }

    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { emailBody: { contains: search, mode: 'insensitive' } },
        { targetAudience: { contains: search, mode: 'insensitive' } },
      ]
    }

    const alerts = await this.prisma.emailAlert.findMany({
      where,
      orderBy: {
        createdDate: 'desc',
      },
    })

    return alerts.map((alert) => this.formatResponse(alert))
  }

  async findOne(id: string) {
    const alert = await this.prisma.emailAlert.findUnique({
      where: { id },
    })

    if (!alert) {
      throw new NotFoundException('Email alert not found')
    }

    return this.formatResponse(alert)
  }

  async update(id: string, updateDto: UpdateEmailAlertDto) {
    const alert = await this.prisma.emailAlert.findUnique({
      where: { id },
    })

    if (!alert) {
      throw new NotFoundException('Email alert not found')
    }

    const updated = await this.prisma.emailAlert.update({
      where: { id },
      data: {
        ...(updateDto.subject && { subject: updateDto.subject }),
        ...(updateDto.emailBody && { emailBody: updateDto.emailBody }),
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
    const alert = await this.prisma.emailAlert.findUnique({
      where: { id },
    })

    if (!alert) {
      throw new NotFoundException('Email alert not found')
    }

    await this.prisma.emailAlert.delete({
      where: { id },
    })
  }

  /**
   * Send email alert to target employees
   */
  async send(id: string) {
    const alert = await this.prisma.emailAlert.findUnique({
      where: { id },
    })

    if (!alert) {
      throw new NotFoundException('Email alert not found')
    }

    if (alert.status === 'SENT') {
      throw new Error('Email alert has already been sent')
    }

    try {
      // Get target employees' emails
      const emails = await this.getTargetEmails(alert.targetAudience, alert.targetDetails)

      this.logger.log(`Sending email alert ${id} to ${emails.length} recipients`)

      if (emails.length === 0) {
        throw new Error('No recipients found for the target audience')
      }

      // Send emails
      const result = await this.mailService.sendBulkMails(
        emails,
        alert.subject,
        alert.emailBody,
        this.stripHtml(alert.emailBody), // Plain text version
      )

      this.logger.log(`Email alert ${id} sent: ${result.success} success, ${result.failed} failed`)

      // Update alert status
      const updated = await this.prisma.emailAlert.update({
        where: { id },
        data: {
          status: result.failed === emails.length ? 'FAILED' : 'SENT',
          sentDate: new Date(),
          sentCount: emails.length,
          deliveredCount: result.success,
        },
      })

      return {
        ...this.formatResponse(updated),
        sendResult: {
          total: emails.length,
          success: result.success,
          failed: result.failed,
          errors: result.errors.slice(0, 10), // Limit errors to first 10
        },
      }
    } catch (error: any) {
      this.logger.error(`Failed to send email alert ${id}: ${error.message}`)

      // Update status to FAILED
      await this.prisma.emailAlert.update({
        where: { id },
        data: {
          status: 'FAILED',
        },
      })

      throw error
    }
  }

  /**
   * Get target employee emails based on audience type
   * Fetches from User table for users linked to active EmployeeMaster records
   */
  private async getTargetEmails(targetAudience: string, targetDetails?: string | null): Promise<string[]> {
    // Base filter for employees - only active employees with linked users
    const employeeWhere: any = {
      status: 'ACTIVE',
      NOT: { userId: null }, // Only employees linked to users
    }

    switch (targetAudience) {
      case 'ALL_EMPLOYEES':
        // Get all active employees with linked users
        this.logger.log('Fetching all employee emails from linked users')
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
            this.logger.log(`Fetching emails for department: ${department.departmentName}`)
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
            this.logger.log(`Fetching emails for designation: ${designation.designationName}`)
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
            // Get users assigned to this project
            const userProjects = await this.prisma.userProject.findMany({
              where: { projectId: project.id },
              include: {
                user: {
                  select: { id: true, email: true, isActive: true },
                },
              },
            })

            // Filter to only active users with valid emails
            const emails = userProjects
              .filter((up) => up.user.isActive && up.user.email)
              .map((up) => up.user.email)

            this.logger.log(`Found ${emails.length} user emails for project: ${project.name}`)
            return emails
          } else {
            this.logger.warn(`Project not found: ${targetDetails}`)
            return []
          }
        }
        break

      case 'INDIVIDUAL':
        if (targetDetails) {
          // Find user by email directly, or find via employee code
          const user = await this.prisma.user.findFirst({
            where: {
              OR: [
                { email: { equals: targetDetails, mode: 'insensitive' } },
                {
                  employeeMaster: {
                    employeeCode: { equals: targetDetails, mode: 'insensitive' },
                  },
                },
              ],
              isActive: true,
            },
            select: { email: true },
          })

          if (user?.email) {
            return [user.email]
          } else {
            this.logger.warn(`User not found: ${targetDetails}`)
            return []
          }
        }
        break

      default:
        this.logger.warn(`Unknown target audience: ${targetAudience}`)
        return []
    }

    // Get employees with linked users, then fetch user emails
    const employees = await this.prisma.employeeMaster.findMany({
      where: employeeWhere,
      include: {
        user: {
          select: { email: true, isActive: true },
        },
      },
    })

    // Extract emails from linked users (only active users)
    const emails = employees
      .filter((e) => e.user && e.user.isActive && e.user.email)
      .map((e) => e.user!.email)

    this.logger.log(`Found ${emails.length} user email addresses`)

    return emails
  }

  /**
   * Strip HTML tags for plain text version
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim()
  }

  private formatResponse(alert: any) {
    return {
      id: alert.id,
      subject: alert.subject,
      emailBody: alert.emailBody,
      targetAudience: alert.targetAudience,
      targetDetails: alert.targetDetails,
      templateId: alert.templateId,
      scheduledDate: alert.scheduledDate?.toISOString(),
      sentDate: alert.sentDate?.toISOString(),
      status: alert.status,
      sentCount: alert.sentCount,
      deliveredCount: alert.deliveredCount,
      openedCount: alert.openedCount,
      createdBy: alert.createdBy,
      createdDate: alert.createdDate.toISOString().split('T')[0],
    }
  }
}
