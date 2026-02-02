import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateDailyAttendanceDto, AttendanceStatus } from './dto/create-daily-attendance.dto'
import { UpdateDailyAttendanceDto } from './dto/update-daily-attendance.dto'
import { parseUTCISO, utcToIST } from '../common/timezone.util'

@Injectable()
export class DailyAttendanceService {
  constructor(private prisma: PrismaService) {}

  // Helper to check if date is a Sunday
  private isSunday(date: Date): boolean {
    return date.getDay() === 0
  }

  // Helper to check if date is 2nd Saturday
  private is2ndSaturday(date: Date): boolean {
    if (date.getDay() !== 6) return false // Not a Saturday
    const dayOfMonth = date.getDate()
    const saturdayNumber = Math.ceil(dayOfMonth / 7)
    return saturdayNumber === 2
  }

  // Helper to check if date is a weekoff (Sunday or 2nd Saturday)
  private isWeekoff(date: Date): boolean {
    return this.isSunday(date) || this.is2ndSaturday(date)
  }

  // Generate/sync attendance records for an employee from startDate to endDate
  async generateAttendanceRecords(employeeMasterId: string, startDate: string, endDate: string) {
    // Verify employee exists
    const employee = await this.prisma.employeeMaster.findUnique({
      where: { id: employeeMasterId },
      include: { shift: true },
    })

    if (!employee) {
      throw new NotFoundException('Employee not found')
    }

    // Get holidays for the date range
    const start = new Date(startDate)
    const end = new Date(endDate)
    const year = start.getFullYear()

    const holidays = await this.prisma.holiday.findMany({
      where: {
        year: year,
        isActive: true,
        holidayDate: {
          gte: start,
          lte: end,
        },
      },
    })

    const holidayDates = new Set(holidays.map((h) => utcToIST(h.holidayDate).dateStr))

    // Get existing GPS punches for the date range
    const gpsPunches = await this.prisma.gPSPunch.findMany({
      where: {
        employeeMasterId,
        punchTime: {
          gte: start,
          lte: new Date(end.getTime() + 24 * 60 * 60 * 1000), // Include end date
        },
      },
      include: {
        geofenceArea: true,
      },
      orderBy: { punchTime: 'asc' },
    })

    // Group punches by IST date (server is source of truth; device timezone must not affect stored time)
    const punchesByDate: Record<string, any[]> = {}
    gpsPunches.forEach((punch) => {
      const dateStr = utcToIST(punch.punchTime).dateStr
      if (!punchesByDate[dateStr]) {
        punchesByDate[dateStr] = []
      }
      punchesByDate[dateStr].push(punch)
    })

    // Get existing daily attendance records
    const existingRecords = await this.prisma.dailyAttendance.findMany({
      where: {
        employeeMasterId,
        date: {
          gte: start,
          lte: end,
        },
      },
    })

    const existingDates = new Set(existingRecords.map((r) => utcToIST(r.date).dateStr))

    const results: any[] = []
    const currentDate = new Date(start)
    const today = new Date()
    today.setHours(23, 59, 59, 999)

    // Loop through each date from start to end (or today) using IST calendar date
    while (currentDate <= end && currentDate <= today) {
      const dateStr = utcToIST(
        new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 12, 0, 0),
      ).dateStr
      const datePunches = punchesByDate[dateStr] || []

      // Determine the status for this date
      let status: AttendanceStatus
      let checkIn: string | null = null
      let checkOut: string | null = null
      let workingHours: number | null = null
      let remarks: string | null = null

      // Check if it's a holiday
      if (holidayDates.has(dateStr)) {
        status = AttendanceStatus.HOLIDAY
        const holiday = holidays.find((h) => utcToIST(h.holidayDate).dateStr === dateStr)
        remarks = holiday?.holidayName || 'Holiday'
      }
      // Check if it's a weekoff
      else if (this.isWeekoff(currentDate)) {
        status = AttendanceStatus.WEEK_OFF
        remarks = this.isSunday(currentDate) ? 'Sunday' : '2nd Saturday'
      }
      // Check if there are punches
      else if (datePunches.length > 0) {
        // Find first IN and last OUT
        const sortedPunches = [...datePunches].sort(
          (a, b) => a.punchTime.getTime() - b.punchTime.getTime(),
        )
        const firstIn = sortedPunches.find((p) => p.punchType === 'IN')
        const lastOut = [...sortedPunches].reverse().find((p) => p.punchType === 'OUT')

        if (firstIn) {
          checkIn = utcToIST(firstIn.punchTime).timeStr
          status = AttendanceStatus.PRESENT
          remarks = firstIn.geofenceArea?.geofenceName || 'GPS Punch'
        } else {
          status = AttendanceStatus.ABSENT
        }

        if (lastOut) {
          checkOut = utcToIST(lastOut.punchTime).timeStr
        }

        // Calculate working hours
        if (firstIn && lastOut) {
          const diffMs = lastOut.punchTime.getTime() - firstIn.punchTime.getTime()
          workingHours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2))
        }
      }
      // No punches on a working day
      else {
        status = AttendanceStatus.ABSENT
        remarks = 'No punch recorded'
      }

      // Check if record already exists
      if (existingDates.has(dateStr)) {
        // Update existing record
        const existingRecord = existingRecords.find(
          (r) => utcToIST(r.date).dateStr === dateStr,
        )
        if (existingRecord) {
          const updated = await this.prisma.dailyAttendance.update({
            where: { id: existingRecord.id },
            data: {
              status,
              checkIn: checkIn || existingRecord.checkIn,
              checkOut: checkOut || existingRecord.checkOut,
              workingHours: workingHours || existingRecord.workingHours,
              remarks: remarks || existingRecord.remarks,
            },
            include: { employeeMaster: true },
          })
          results.push(this.formatResponse(updated))
        }
      } else {
        // Create new record
        const created = await this.prisma.dailyAttendance.create({
          data: {
            employeeMasterId,
            date: new Date(dateStr),
            status,
            checkIn,
            checkOut,
            workingHours,
            remarks,
          },
          include: { employeeMaster: true },
        })
        results.push(this.formatResponse(created))
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1)
    }

    return {
      message: `Generated/updated ${results.length} attendance records`,
      records: results,
    }
  }

  /** Resolve date, checkIn, checkOut from UTC punch date times (server is source of truth). */
  private resolveAttendanceTimesFromUTC(dto: {
    checkInPunchDateTime?: string
    checkOutPunchDateTime?: string
    date?: string
    checkIn?: string
    checkOut?: string
  }): { date: Date; checkIn: string | null; checkOut: string | null } {
    let date: Date | undefined
    let checkIn: string | null = dto.checkIn ?? null
    let checkOut: string | null = dto.checkOut ?? null

    if (dto.checkInPunchDateTime) {
      const parsed = parseUTCISO(dto.checkInPunchDateTime)
      if (!parsed) {
        throw new BadRequestException('checkInPunchDateTime must be a valid UTC ISO 8601 string')
      }
      const ist = utcToIST(parsed)
      date = new Date(ist.dateStr)
      checkIn = ist.timeStr
    }

    if (dto.checkOutPunchDateTime) {
      const parsed = parseUTCISO(dto.checkOutPunchDateTime)
      if (!parsed) {
        throw new BadRequestException('checkOutPunchDateTime must be a valid UTC ISO 8601 string')
      }
      const ist = utcToIST(parsed)
      if (!date) {
        date = new Date(ist.dateStr)
      }
      checkOut = ist.timeStr
    }

    if (!date) {
      if (dto.date) {
        date = new Date(dto.date)
      } else {
        throw new BadRequestException('Provide date or checkInPunchDateTime or checkOutPunchDateTime')
      }
    }

    return { date, checkIn, checkOut }
  }

  async create(createDto: CreateDailyAttendanceDto) {
    // Verify employee exists
    const employee = await this.prisma.employeeMaster.findUnique({
      where: { id: createDto.employeeMasterId },
    })

    if (!employee) {
      throw new NotFoundException('Employee not found')
    }

    const { date, checkIn, checkOut } = this.resolveAttendanceTimesFromUTC({
      checkInPunchDateTime: createDto.checkInPunchDateTime,
      checkOutPunchDateTime: createDto.checkOutPunchDateTime,
      date: createDto.date,
      checkIn: createDto.checkIn,
      checkOut: createDto.checkOut,
    })

    const attendance = await this.prisma.dailyAttendance.create({
      data: {
        employeeMasterId: createDto.employeeMasterId,
        date,
        checkIn,
        checkOut,
        workingHours: createDto.workingHours,
        status: createDto.status || 'ABSENT',
        location: createDto.location,
        remarks: createDto.remarks,
      },
      include: {
        employeeMaster: true,
      },
    })

    return this.formatResponse(attendance)
  }

  async findAll(
    employeeId?: string,
    date?: string,
    status?: string,
    departmentId?: string,
    search?: string,
  ) {
    const where: any = {}

    if (employeeId) {
      where.employeeMasterId = employeeId
    }

    if (date) {
      where.date = new Date(date)
    }

    if (status) {
      where.status = status.toUpperCase()
    }

    if (departmentId) {
      where.employeeMaster = {
        departmentId: departmentId,
      }
    }

    if (search) {
      where.OR = [
        { employeeMaster: { firstName: { contains: search, mode: 'insensitive' } } },
        { employeeMaster: { lastName: { contains: search, mode: 'insensitive' } } },
        { employeeMaster: { employeeCode: { contains: search, mode: 'insensitive' } } },
        { location: { contains: search, mode: 'insensitive' } },
        { remarks: { contains: search, mode: 'insensitive' } },
      ]
    }

    const attendances = await this.prisma.dailyAttendance.findMany({
      where,
      include: {
        employeeMaster: true,
      },
      orderBy: {
        date: 'desc',
      },
    })

    return attendances.map((attendance) => this.formatResponse(attendance))
  }

  async findOne(id: string) {
    const attendance = await this.prisma.dailyAttendance.findUnique({
      where: { id },
      include: {
        employeeMaster: true,
      },
    })

    if (!attendance) {
      throw new NotFoundException('Daily attendance not found')
    }

    return this.formatResponse(attendance)
  }

  async update(id: string, updateDto: UpdateDailyAttendanceDto) {
    const attendance = await this.prisma.dailyAttendance.findUnique({
      where: { id },
    })

    if (!attendance) {
      throw new NotFoundException('Daily attendance not found')
    }

    const hasPunchDateTimes =
      updateDto.checkInPunchDateTime !== undefined || updateDto.checkOutPunchDateTime !== undefined
    let data: any = {
      ...(updateDto.workingHours !== undefined && { workingHours: updateDto.workingHours }),
      ...(updateDto.status && { status: updateDto.status }),
      ...(updateDto.location !== undefined && { location: updateDto.location }),
      ...(updateDto.remarks !== undefined && { remarks: updateDto.remarks }),
    }

    if (hasPunchDateTimes) {
      const resolved = this.resolveAttendanceTimesFromUTC({
        checkInPunchDateTime: updateDto.checkInPunchDateTime,
        checkOutPunchDateTime: updateDto.checkOutPunchDateTime,
        date: updateDto.date ?? attendance.date.toISOString().split('T')[0],
        checkIn: updateDto.checkIn ?? attendance.checkIn ?? undefined,
        checkOut: updateDto.checkOut ?? attendance.checkOut ?? undefined,
      })
      data.date = resolved.date
      data.checkIn = resolved.checkIn
      data.checkOut = resolved.checkOut
    } else {
      data = {
        ...data,
        ...(updateDto.date && { date: new Date(updateDto.date) }),
        ...(updateDto.checkIn !== undefined && { checkIn: updateDto.checkIn }),
        ...(updateDto.checkOut !== undefined && { checkOut: updateDto.checkOut }),
      }
    }

    const updated = await this.prisma.dailyAttendance.update({
      where: { id },
      data,
      include: {
        employeeMaster: true,
      },
    })

    return this.formatResponse(updated)
  }

  async remove(id: string) {
    const attendance = await this.prisma.dailyAttendance.findUnique({
      where: { id },
    })

    if (!attendance) {
      throw new NotFoundException('Daily attendance not found')
    }

    await this.prisma.dailyAttendance.delete({
      where: { id },
    })
  }

  private formatResponse(attendance: any) {
    return {
      id: attendance.id,
      employeeMasterId: attendance.employeeMasterId,
      employeeName: attendance.employeeMaster
        ? `${attendance.employeeMaster.firstName} ${attendance.employeeMaster.lastName}`
        : undefined,
      employeeCode: attendance.employeeMaster?.employeeCode,
      department: attendance.employeeMaster?.departmentId,
      designation: attendance.employeeMaster?.designationId,
      date: attendance.date.toISOString().split('T')[0],
      checkIn: attendance.checkIn,
      checkOut: attendance.checkOut,
      workingHours: attendance.workingHours,
      status: attendance.status,
      location: attendance.location,
      remarks: attendance.remarks,
    }
  }
}
