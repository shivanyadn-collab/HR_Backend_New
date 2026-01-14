import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateShiftChangeRequestDto } from './dto/create-shift-change-request.dto'
import { UpdateShiftChangeRequestDto, ShiftChangeRequestStatus } from './dto/update-shift-change-request.dto'

@Injectable()
export class ShiftChangeRequestsService {
  constructor(private prisma: PrismaService) {}

  async create(createDto: CreateShiftChangeRequestDto) {
    // Verify employee exists
    const employee = await this.prisma.employeeMaster.findUnique({
      where: { id: createDto.employeeMasterId },
    })

    if (!employee) {
      throw new NotFoundException('Employee not found')
    }

    // Verify current shift exists
    const currentShift = await this.prisma.shift.findUnique({
      where: { id: createDto.currentShiftId },
    })

    if (!currentShift) {
      throw new NotFoundException('Current shift not found')
    }

    // Verify requested shift exists
    const requestedShift = await this.prisma.shift.findUnique({
      where: { id: createDto.requestedShiftId },
    })

    if (!requestedShift) {
      throw new NotFoundException('Requested shift not found')
    }

    // Cannot request same shift
    if (createDto.currentShiftId === createDto.requestedShiftId) {
      throw new BadRequestException('Cannot request the same shift')
    }

    // Check for pending requests
    const pendingRequest = await this.prisma.shiftChangeRequest.findFirst({
      where: {
        employeeMasterId: createDto.employeeMasterId,
        status: 'PENDING',
      },
    })

    if (pendingRequest) {
      throw new BadRequestException('You already have a pending shift change request')
    }

    // Generate request number
    const year = new Date().getFullYear()
    const count = await this.prisma.shiftChangeRequest.count({
      where: {
        requestDate: {
          gte: new Date(`${year}-01-01`),
          lt: new Date(`${year + 1}-01-01`),
        },
      },
    })
    const requestNumber = `SCR-${year}-${String(count + 1).padStart(4, '0')}`

    const request = await this.prisma.shiftChangeRequest.create({
      data: {
        requestNumber,
        employeeMasterId: createDto.employeeMasterId,
        currentShiftId: createDto.currentShiftId,
        requestedShiftId: createDto.requestedShiftId,
        effectiveDate: new Date(createDto.effectiveDate),
        reason: createDto.reason,
        remarks: createDto.remarks,
        status: 'PENDING',
      },
      include: {
        employeeMaster: true,
        currentShift: true,
        requestedShift: true,
      },
    })

    return this.formatResponse(request)
  }

  async findAll(employeeMasterId?: string, status?: string, startDate?: string, endDate?: string) {
    const where: any = {}

    if (employeeMasterId) {
      where.employeeMasterId = employeeMasterId
    }

    if (status) {
      where.status = status.toUpperCase()
    }

    if (startDate || endDate) {
      where.requestDate = {}
      if (startDate) {
        where.requestDate.gte = new Date(startDate)
      }
      if (endDate) {
        where.requestDate.lte = new Date(endDate)
      }
    }

    const requests = await this.prisma.shiftChangeRequest.findMany({
      where,
      include: {
        employeeMaster: true,
        currentShift: true,
        requestedShift: true,
      },
      orderBy: {
        requestDate: 'desc',
      },
    })

    return requests.map((req) => this.formatResponse(req))
  }

  async findOne(id: string) {
    const request = await this.prisma.shiftChangeRequest.findUnique({
      where: { id },
      include: {
        employeeMaster: true,
        currentShift: true,
        requestedShift: true,
      },
    })

    if (!request) {
      throw new NotFoundException('Shift change request not found')
    }

    return this.formatResponse(request)
  }

  async update(id: string, updateDto: UpdateShiftChangeRequestDto) {
    const request = await this.prisma.shiftChangeRequest.findUnique({
      where: { id },
    })

    if (!request) {
      throw new NotFoundException('Shift change request not found')
    }

    const updateData: any = {}

    if (updateDto.status) {
      updateData.status = updateDto.status
      if (updateDto.status === 'APPROVED') {
        updateData.approvedDate = new Date()
        updateData.approvedBy = updateDto.approvedBy
      } else if (updateDto.status === 'REJECTED') {
        updateData.rejectionReason = updateDto.rejectionReason || 'No reason provided'
      }
    }

    if (updateDto.remarks !== undefined) {
      updateData.remarks = updateDto.remarks
    }

    const updated = await this.prisma.shiftChangeRequest.update({
      where: { id },
      data: updateData,
      include: {
        employeeMaster: true,
        currentShift: true,
        requestedShift: true,
      },
    })

    // If approved, update employee's shift
    if (updateDto.status === 'APPROVED') {
      await this.prisma.employeeMaster.update({
        where: { id: request.employeeMasterId },
        data: { shiftId: request.requestedShiftId },
      })
    }

    return this.formatResponse(updated)
  }

  async cancel(id: string, reason?: string) {
    const request = await this.prisma.shiftChangeRequest.findUnique({
      where: { id },
    })

    if (!request) {
      throw new NotFoundException('Shift change request not found')
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException('Only pending requests can be cancelled')
    }

    const updated = await this.prisma.shiftChangeRequest.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        remarks: reason || 'Cancelled by employee',
      },
      include: {
        employeeMaster: true,
        currentShift: true,
        requestedShift: true,
      },
    })

    return this.formatResponse(updated)
  }

  async remove(id: string) {
    const request = await this.prisma.shiftChangeRequest.findUnique({
      where: { id },
    })

    if (!request) {
      throw new NotFoundException('Shift change request not found')
    }

    await this.prisma.shiftChangeRequest.delete({
      where: { id },
    })
  }

  private formatResponse(request: any) {
    return {
      id: request.id,
      requestNumber: request.requestNumber,
      employeeMasterId: request.employeeMasterId,
      employeeName: request.employeeMaster
        ? `${request.employeeMaster.firstName} ${request.employeeMaster.lastName}`
        : null,
      employeeCode: request.employeeMaster?.employeeCode || null,
      department: request.employeeMaster?.departmentId || null,
      currentShiftId: request.currentShiftId,
      currentShiftName: request.currentShift?.shiftName || null,
      currentShiftCode: request.currentShift?.shiftCode || null,
      currentShiftTiming: request.currentShift
        ? `${request.currentShift.startTime} - ${request.currentShift.endTime}`
        : null,
      currentShiftType: request.currentShift?.shiftType || null,
      requestedShiftId: request.requestedShiftId,
      requestedShiftName: request.requestedShift?.shiftName || null,
      requestedShiftCode: request.requestedShift?.shiftCode || null,
      requestedShiftTiming: request.requestedShift
        ? `${request.requestedShift.startTime} - ${request.requestedShift.endTime}`
        : null,
      requestedShiftType: request.requestedShift?.shiftType || null,
      requestDate: request.requestDate.toISOString().split('T')[0],
      effectiveDate: request.effectiveDate.toISOString().split('T')[0],
      reason: request.reason,
      status: request.status,
      approvedBy: request.approvedBy || null,
      approvedDate: request.approvedDate ? request.approvedDate.toISOString().split('T')[0] : null,
      rejectionReason: request.rejectionReason || null,
      remarks: request.remarks || null,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    }
  }
}
