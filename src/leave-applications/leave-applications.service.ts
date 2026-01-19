import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateLeaveApplicationDto, LeaveSession } from './dto/create-leave-application.dto'
import { UpdateLeaveApplicationDto } from './dto/update-leave-application.dto'

@Injectable()
export class LeaveApplicationsService {
  constructor(private prisma: PrismaService) {}

  async create(createDto: CreateLeaveApplicationDto) {
    // Verify employee exists
    const employee = await this.prisma.employeeMaster.findUnique({
      where: { id: createDto.employeeMasterId },
    })

    if (!employee) {
      throw new NotFoundException('Employee not found')
    }

    // Verify leave policy exists
    const leavePolicy = await this.prisma.leavePolicy.findUnique({
      where: { id: createDto.leavePolicyId },
    })

    if (!leavePolicy) {
      throw new NotFoundException('Leave policy not found')
    }

    // Validate dates
    const startDate = new Date(createDto.startDate)
    const endDate = new Date(createDto.endDate)

    if (startDate > endDate) {
      throw new BadRequestException('Start date cannot be after end date')
    }

    // Determine leave session
    const leaveSession = createDto.leaveSession || LeaveSession.FULL_DAY

    // Calculate total days based on leave session
    let totalDays: number
    if (leaveSession === LeaveSession.FIRST_HALF || leaveSession === LeaveSession.SECOND_HALF) {
      // Half-day leave - must be same day
      if (startDate.getTime() !== endDate.getTime()) {
        throw new BadRequestException('Half-day leave must be for a single day')
      }
      totalDays = 0.5
    } else {
      // Full day leave calculation
      const timeDiff = endDate.getTime() - startDate.getTime()
      totalDays = Math.ceil(timeDiff / (1000 * 60 * 60 * 24)) + 1
    }

    // Check leave balance
    const currentYear = new Date().getFullYear()
    const leaveBalance = await this.prisma.leaveBalance.findFirst({
      where: {
        employeeMasterId: createDto.employeeMasterId,
        leavePolicyId: createDto.leavePolicyId,
        year: currentYear,
      },
    })

    // Only check balance if leave type is not LOP (Loss of Pay)
    if (leavePolicy.leaveCode !== 'LOP' && leavePolicy.leaveCode !== 'LOSS_OF_PAY') {
      if (!leaveBalance || leaveBalance.available < totalDays) {
        const available = leaveBalance?.available || 0
        throw new BadRequestException(
          `Insufficient leave balance. Available: ${available} days, Requested: ${totalDays} days`,
        )
      }
    }

    // Generate application number
    const year = new Date().getFullYear()
    const count = await this.prisma.leaveApplication.count({
      where: {
        appliedDate: {
          gte: new Date(`${year}-01-01`),
          lt: new Date(`${year + 1}-01-01`),
        },
      },
    })
    const applicationNumber = `LA-${year}-${String(count + 1).padStart(4, '0')}`

    const application = await this.prisma.leaveApplication.create({
      data: {
        applicationNumber,
        employeeMasterId: createDto.employeeMasterId,
        leavePolicyId: createDto.leavePolicyId,
        startDate,
        endDate,
        totalDays,
        leaveSession: leaveSession as any,
        reason: createDto.reason,
        attachmentUrl: createDto.attachmentUrl,
        attachmentName: createDto.attachmentName,
        status: 'PENDING',
        appliedDate: new Date(),
      },
      include: {
        employeeMaster: true,
        leavePolicy: true,
      },
    })

    return this.formatResponse(application)
  }

  async cancel(id: string, reason?: string) {
    const application = await this.prisma.leaveApplication.findUnique({
      where: { id },
      include: { leavePolicy: true },
    })

    if (!application) {
      throw new NotFoundException('Leave application not found')
    }

    // Can only cancel pending or approved applications
    if (application.status !== 'PENDING' && application.status !== 'APPROVED') {
      throw new BadRequestException('Only pending or approved leave applications can be cancelled')
    }

    // If approved leave is being cancelled, restore the balance
    if (application.status === 'APPROVED') {
      const currentYear = new Date().getFullYear()
      await this.prisma.leaveBalance.updateMany({
        where: {
          employeeMasterId: application.employeeMasterId,
          leavePolicyId: application.leavePolicyId,
          year: currentYear,
        },
        data: {
          used: { decrement: application.totalDays },
          available: { increment: application.totalDays },
        },
      })
    }

    const updated = await this.prisma.leaveApplication.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        rejectionReason: reason || 'Cancelled by employee',
      },
      include: {
        employeeMaster: true,
        leavePolicy: true,
      },
    })

    return this.formatResponse(updated)
  }

  async findAll(
    employeeMasterId?: string,
    status?: string,
    startDate?: string,
    endDate?: string,
    search?: string,
  ) {
    const where: any = {}

    if (employeeMasterId) {
      where.employeeMasterId = employeeMasterId
    }

    if (status) {
      where.status = status.toUpperCase()
    }

    if (startDate || endDate) {
      where.appliedDate = {}
      if (startDate) {
        where.appliedDate.gte = new Date(startDate)
      }
      if (endDate) {
        where.appliedDate.lte = new Date(endDate)
      }
    }

    if (search) {
      where.OR = [
        { applicationNumber: { contains: search, mode: 'insensitive' } },
        { reason: { contains: search, mode: 'insensitive' } },
        { employeeMaster: { firstName: { contains: search, mode: 'insensitive' } } },
        { employeeMaster: { lastName: { contains: search, mode: 'insensitive' } } },
        { employeeMaster: { employeeCode: { contains: search, mode: 'insensitive' } } },
      ]
    }

    const applications = await this.prisma.leaveApplication.findMany({
      where,
      include: {
        employeeMaster: true,
        leavePolicy: true,
      },
      orderBy: {
        appliedDate: 'desc',
      },
    })

    return applications.map((app) => this.formatResponse(app))
  }

  async findOne(id: string) {
    const application = await this.prisma.leaveApplication.findUnique({
      where: { id },
      include: {
        employeeMaster: true,
        leavePolicy: true,
      },
    })

    if (!application) {
      throw new NotFoundException('Leave application not found')
    }

    return this.formatResponse(application)
  }

  async update(id: string, updateDto: UpdateLeaveApplicationDto) {
    const application = await this.prisma.leaveApplication.findUnique({
      where: { id },
    })

    if (!application) {
      throw new NotFoundException('Leave application not found')
    }

    const updateData: any = {}

    if (updateDto.employeeMasterId) {
      const employee = await this.prisma.employeeMaster.findUnique({
        where: { id: updateDto.employeeMasterId },
      })
      if (!employee) {
        throw new NotFoundException('Employee not found')
      }
      updateData.employeeMasterId = updateDto.employeeMasterId
    }

    if (updateDto.leavePolicyId) {
      const leavePolicy = await this.prisma.leavePolicy.findUnique({
        where: { id: updateDto.leavePolicyId },
      })
      if (!leavePolicy) {
        throw new NotFoundException('Leave policy not found')
      }
      updateData.leavePolicyId = updateDto.leavePolicyId
    }

    if (updateDto.startDate || updateDto.endDate) {
      const startDate = updateDto.startDate ? new Date(updateDto.startDate) : application.startDate
      const endDate = updateDto.endDate ? new Date(updateDto.endDate) : application.endDate

      if (startDate > endDate) {
        throw new BadRequestException('Start date cannot be after end date')
      }

      updateData.startDate = startDate
      updateData.endDate = endDate

      // Recalculate total days
      const timeDiff = endDate.getTime() - startDate.getTime()
      updateData.totalDays = Math.ceil(timeDiff / (1000 * 60 * 60 * 24)) + 1
    }

    if (updateDto.reason !== undefined) {
      updateData.reason = updateDto.reason
    }

    if (updateDto.status) {
      updateData.status = updateDto.status
      if (updateDto.status === 'APPROVED') {
        updateData.approvedDate = new Date()
      } else if (updateDto.status === 'REJECTED') {
        updateData.rejectionReason = updateDto.rejectionReason || 'No reason provided'
      }
    }

    const updated = await this.prisma.leaveApplication.update({
      where: { id },
      data: updateData,
      include: {
        employeeMaster: true,
        leavePolicy: true,
      },
    })

    return this.formatResponse(updated)
  }

  async remove(id: string) {
    const application = await this.prisma.leaveApplication.findUnique({
      where: { id },
    })

    if (!application) {
      throw new NotFoundException('Leave application not found')
    }

    await this.prisma.leaveApplication.delete({
      where: { id },
    })
  }

  async approve(id: string, comments?: string) {
    return this.update(id, { status: 'APPROVED' as any })
  }

  async reject(id: string, rejectionReason: string) {
    return this.update(id, { status: 'REJECTED' as any, rejectionReason })
  }

  private formatResponse(application: any) {
    return {
      id: application.id,
      applicationNumber: application.applicationNumber,
      employeeMasterId: application.employeeMasterId,
      employeeName: application.employeeMaster
        ? `${application.employeeMaster.firstName} ${application.employeeMaster.lastName}`
        : null,
      employeeCode: application.employeeMaster?.employeeCode || null,
      department: application.employeeMaster?.departmentId || null,
      leavePolicyId: application.leavePolicyId,
      leaveType: application.leavePolicy?.leaveType || null,
      leaveCode: application.leavePolicy?.leaveCode || null,
      startDate: application.startDate.toISOString().split('T')[0],
      endDate: application.endDate.toISOString().split('T')[0],
      totalDays: application.totalDays,
      leaveSession: application.leaveSession || 'FULL_DAY',
      reason: application.reason,
      status: application.status,
      appliedDate: application.appliedDate.toISOString().split('T')[0],
      approvedBy: application.approvedBy || null,
      approvedDate: application.approvedDate
        ? application.approvedDate.toISOString().split('T')[0]
        : null,
      rejectionReason: application.rejectionReason || null,
      attachmentUrl: application.attachmentUrl || null,
      attachmentName: application.attachmentName || null,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
    }
  }
}
