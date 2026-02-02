import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateCheckInOutLogDto } from './dto/create-check-in-out-log.dto'
import { UpdateCheckInOutLogDto } from './dto/update-check-in-out-log.dto'
import { parseUTCISO, utcToIST } from '../common/timezone.util'

@Injectable()
export class CheckInOutLogsService {
  constructor(private prisma: PrismaService) {}

  /** Compute logDate, checkInTime, checkOutTime from UTC punch date times (server is source of truth). */
  private resolveLogTimesFromUTC(dto: {
    checkInPunchDateTime?: string
    checkOutPunchDateTime?: string
    logDate?: string
    checkInTime?: string
    checkOutTime?: string
  }): { logDate: Date; checkInTime: string | null; checkOutTime: string | null } {
    let logDate: Date | undefined
    let checkInTime: string | null = dto.checkInTime ?? null
    let checkOutTime: string | null = dto.checkOutTime ?? null

    if (dto.checkInPunchDateTime) {
      const parsed = parseUTCISO(dto.checkInPunchDateTime)
      if (!parsed) {
        throw new BadRequestException('checkInPunchDateTime must be a valid UTC ISO 8601 string')
      }
      const ist = utcToIST(parsed)
      logDate = new Date(ist.dateStr)
      checkInTime = ist.timeStr
    }

    if (dto.checkOutPunchDateTime) {
      const parsed = parseUTCISO(dto.checkOutPunchDateTime)
      if (!parsed) {
        throw new BadRequestException('checkOutPunchDateTime must be a valid UTC ISO 8601 string')
      }
      const ist = utcToIST(parsed)
      if (!logDate) {
        logDate = new Date(ist.dateStr)
      }
      checkOutTime = ist.timeStr
    }

    if (!logDate) {
      if (dto.logDate) {
        logDate = new Date(dto.logDate)
      } else {
        throw new BadRequestException('Provide logDate or checkInPunchDateTime or checkOutPunchDateTime')
      }
    }

    return { logDate, checkInTime, checkOutTime }
  }

  async create(createDto: CreateCheckInOutLogDto) {
    const employee = await this.prisma.employeeMaster.findUnique({
      where: { id: createDto.employeeMasterId },
    })

    if (!employee) {
      throw new NotFoundException('Employee not found')
    }

    const { logDate, checkInTime, checkOutTime } = this.resolveLogTimesFromUTC({
      checkInPunchDateTime: createDto.checkInPunchDateTime,
      checkOutPunchDateTime: createDto.checkOutPunchDateTime,
      logDate: createDto.logDate,
      checkInTime: createDto.checkInTime,
      checkOutTime: createDto.checkOutTime,
    })

    const log = await this.prisma.checkInOutLog.create({
      data: {
        employeeMasterId: createDto.employeeMasterId,
        logDate,
        checkInTime,
        checkOutTime,
        checkInLocation: createDto.checkInLocation,
        checkOutLocation: createDto.checkOutLocation,
        checkInMethod: createDto.checkInMethod,
        checkOutMethod: createDto.checkOutMethod,
        workingHours: createDto.workingHours,
        status: createDto.status || 'CHECKED_IN',
      },
      include: {
        employeeMaster: true,
      },
    })

    return this.formatResponse(log)
  }

  async findAll(
    employeeId?: string,
    startDate?: string,
    endDate?: string,
    status?: string,
    search?: string,
  ) {
    const where: any = {}

    if (employeeId) {
      where.employeeMasterId = employeeId
    }

    if (startDate || endDate) {
      where.logDate = {}
      if (startDate) {
        where.logDate.gte = new Date(startDate)
      }
      if (endDate) {
        where.logDate.lte = new Date(endDate)
      }
    }

    if (status) {
      where.status = status.toUpperCase()
    }

    if (search) {
      where.OR = [
        { employeeMaster: { firstName: { contains: search, mode: 'insensitive' } } },
        { employeeMaster: { lastName: { contains: search, mode: 'insensitive' } } },
        { employeeMaster: { employeeCode: { contains: search, mode: 'insensitive' } } },
        { checkInLocation: { contains: search, mode: 'insensitive' } },
        { checkOutLocation: { contains: search, mode: 'insensitive' } },
      ]
    }

    const logs = await this.prisma.checkInOutLog.findMany({
      where,
      include: {
        employeeMaster: true,
      },
      orderBy: {
        logDate: 'desc',
      },
    })

    return logs.map((log) => this.formatResponse(log))
  }

  async findOne(id: string) {
    const log = await this.prisma.checkInOutLog.findUnique({
      where: { id },
      include: {
        employeeMaster: true,
      },
    })

    if (!log) {
      throw new NotFoundException('Check-in/out log not found')
    }

    return this.formatResponse(log)
  }

  async update(id: string, updateDto: UpdateCheckInOutLogDto) {
    const log = await this.prisma.checkInOutLog.findUnique({
      where: { id },
    })

    if (!log) {
      throw new NotFoundException('Check-in/out log not found')
    }

    const hasPunchDateTimes =
      updateDto.checkInPunchDateTime !== undefined || updateDto.checkOutPunchDateTime !== undefined
    let data: any = {
      ...(updateDto.checkInLocation !== undefined && {
        checkInLocation: updateDto.checkInLocation,
      }),
      ...(updateDto.checkOutLocation !== undefined && {
        checkOutLocation: updateDto.checkOutLocation,
      }),
      ...(updateDto.checkInMethod && { checkInMethod: updateDto.checkInMethod }),
      ...(updateDto.checkOutMethod !== undefined && { checkOutMethod: updateDto.checkOutMethod }),
      ...(updateDto.workingHours !== undefined && { workingHours: updateDto.workingHours }),
      ...(updateDto.status && { status: updateDto.status }),
    }

    if (hasPunchDateTimes) {
      const resolved = this.resolveLogTimesFromUTC({
        checkInPunchDateTime: updateDto.checkInPunchDateTime,
        checkOutPunchDateTime: updateDto.checkOutPunchDateTime,
        logDate: updateDto.logDate ?? log.logDate.toISOString().split('T')[0],
        checkInTime: updateDto.checkInTime ?? log.checkInTime ?? undefined,
        checkOutTime: updateDto.checkOutTime ?? log.checkOutTime ?? undefined,
      })
      data.logDate = resolved.logDate
      data.checkInTime = resolved.checkInTime
      data.checkOutTime = resolved.checkOutTime
    } else {
      data = {
        ...data,
        ...(updateDto.logDate && { logDate: new Date(updateDto.logDate) }),
        ...(updateDto.checkInTime !== undefined && { checkInTime: updateDto.checkInTime }),
        ...(updateDto.checkOutTime !== undefined && { checkOutTime: updateDto.checkOutTime }),
      }
    }

    const updated = await this.prisma.checkInOutLog.update({
      where: { id },
      data,
      include: {
        employeeMaster: true,
      },
    })

    return this.formatResponse(updated)
  }

  async remove(id: string) {
    const log = await this.prisma.checkInOutLog.findUnique({
      where: { id },
    })

    if (!log) {
      throw new NotFoundException('Check-in/out log not found')
    }

    await this.prisma.checkInOutLog.delete({
      where: { id },
    })
  }

  private formatResponse(log: any) {
    return {
      id: log.id,
      employeeMasterId: log.employeeMasterId,
      employeeName: log.employeeMaster
        ? `${log.employeeMaster.firstName} ${log.employeeMaster.lastName}`
        : undefined,
      employeeCode: log.employeeMaster?.employeeCode,
      department: log.employeeMaster?.departmentId,
      logDate: log.logDate.toISOString().split('T')[0],
      checkInTime: log.checkInTime,
      checkOutTime: log.checkOutTime,
      checkInLocation: log.checkInLocation,
      checkOutLocation: log.checkOutLocation,
      checkInMethod: log.checkInMethod,
      checkOutMethod: log.checkOutMethod,
      workingHours: log.workingHours,
      status: log.status,
    }
  }
}
