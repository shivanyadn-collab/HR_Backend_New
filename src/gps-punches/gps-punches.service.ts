import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateGPSPunchDto } from './dto/create-gps-punch.dto'
import { UpdateGPSPunchDto } from './dto/update-gps-punch.dto'
import { parseUTCISO, utcToIST } from '../common/timezone.util'

@Injectable()
export class GPSPunchesService {
  private readonly logger = new Logger(GPSPunchesService.name)

  constructor(private prisma: PrismaService) {}

  /** Format punch for API: punchTime stored as UTC; add punchDateIST and punchTimeIST (Asia/Kolkata). */
  private formatPunchResponse(punch: any) {
    const ist = utcToIST(punch.punchTime)
    return {
      id: punch.id,
      employeeId: punch.employeeMasterId,
      employeeCode: punch.employeeMaster?.employeeCode ?? '',
      employeeName: punch.employeeMaster
        ? `${punch.employeeMaster.firstName} ${punch.employeeMaster.lastName}`
        : 'Unknown',
      department: (punch as any).departmentName ?? 'Not assigned',
      designation: (punch as any).designationName ?? 'Not assigned',
      projectId: punch.projectId,
      projectName: punch.project?.name,
      projectCode: punch.project?.code,
      geofenceId: punch.geofenceAreaId,
      geofenceName: punch.geofenceArea?.geofenceName,
      punchType: punch.punchType,
      punchTime: punch.punchTime.toISOString(),
      punchDateIST: ist.dateStr,
      punchTimeIST: ist.timeStr,
      latitude: punch.latitude,
      longitude: punch.longitude,
      location: punch.location,
      distance: punch.distance,
      status: punch.status,
      accuracy: punch.accuracy,
      selfieImageUrl: (punch as any).selfieImageUrl,
      remarks: (punch as any).remarks,
      createdAt: punch.createdAt?.toISOString(),
    }
  }

  // Helper to truncate base64 URLs for logging
  private truncateUrl(url?: string): string {
    if (!url) return 'none'
    if (url.startsWith('data:image')) {
      return `${url.substring(0, 50)}...[${url.length} chars]`
    }
    return url.length > 100 ? `${url.substring(0, 100)}...` : url
  }

  async create(createDto: CreateGPSPunchDto) {
    // Canonical punch time: use punchDateTime (UTC ISO) only; ignore client local time
    let punchTimeDate: Date
    if (createDto.punchDateTime) {
      const parsed = parseUTCISO(createDto.punchDateTime)
      if (!parsed) {
        throw new BadRequestException('punchDateTime must be a valid UTC ISO 8601 string')
      }
      punchTimeDate = parsed
    } else if (createDto.punchTime) {
      // Legacy: accept ISO only (interpreted as UTC); do not use time-only local strings
      const parsed = new Date(createDto.punchTime)
      if (!isNaN(parsed.getTime())) {
        punchTimeDate = parsed
      } else {
        punchTimeDate = new Date()
      }
    } else {
      punchTimeDate = new Date()
    }

    const { punchDateTime: _pd, punchTime: _pt, ...restOfDto } = createDto

    this.logger.log(
      `Creating GPS punch: ${createDto.punchType} at ${punchTimeDate.toISOString()} UTC, selfie: ${this.truncateUrl(createDto.selfieImageUrl)}`,
    )

    const punch = await this.prisma.gPSPunch.create({
      data: {
        ...restOfDto,
        punchTime: punchTimeDate,
      },
      include: {
        employeeMaster: true,
        project: true,
        geofenceArea: true,
      },
    })

    return this.formatPunchResponse(punch)
  }

  async findAll(
    employeeMasterId?: string,
    punchType?: string,
    status?: string,
    projectId?: string,
    startDate?: string,
    endDate?: string,
    search?: string,
  ) {
    const where: any = {}

    if (employeeMasterId) where.employeeMasterId = employeeMasterId
    if (punchType && punchType !== 'all') where.punchType = punchType
    if (status && status !== 'all') where.status = status
    if (projectId && projectId !== 'all') where.projectId = projectId

    if (search) {
      where.OR = [
        { employeeMaster: { firstName: { contains: search, mode: 'insensitive' } } },
        { employeeMaster: { lastName: { contains: search, mode: 'insensitive' } } },
        { employeeMaster: { employeeCode: { contains: search, mode: 'insensitive' } } },
      ]
    }

    if (startDate || endDate) {
      where.punchTime = {}
      if (startDate) where.punchTime.gte = new Date(startDate)
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        where.punchTime.lte = end
      }
    }

    const punches = await this.prisma.gPSPunch.findMany({
      where,
      include: {
        employeeMaster: true,
        project: true,
        geofenceArea: true,
      },
      orderBy: { punchTime: 'desc' },
    })

    // Fetch department and designation data for each employee
    const punchesWithDetails = await Promise.all(
      punches.map(async (punch) => {
        let departmentName = 'Not assigned'
        let designationName = 'Not assigned'

        if (punch.employeeMaster?.departmentId) {
          const department = await this.prisma.department.findUnique({
            where: { id: punch.employeeMaster.departmentId },
          })
          departmentName = department?.departmentName || 'Not assigned'
        }

        if (punch.employeeMaster?.designationId) {
          const designation = await this.prisma.designation.findUnique({
            where: { id: punch.employeeMaster.designationId },
          })
          designationName = designation?.designationName || 'Not assigned'
        }

        return {
          id: punch.id,
          employeeId: punch.employeeMasterId,
          employeeCode: punch.employeeMaster?.employeeCode || '',
          employeeName: punch.employeeMaster
            ? `${punch.employeeMaster.firstName} ${punch.employeeMaster.lastName}`
            : 'Unknown',
          department: departmentName,
          designation: designationName,
          projectId: punch.projectId,
          projectName: punch.project?.name,
          projectCode: punch.project?.code,
          geofenceId: punch.geofenceAreaId,
          geofenceName: punch.geofenceArea?.geofenceName,
          punchType: punch.punchType,
          punchTime: punch.punchTime.toISOString(),
          latitude: punch.latitude,
          longitude: punch.longitude,
          location: punch.location,
          distance: punch.distance,
          status: punch.status,
          accuracy: punch.accuracy,
          selfieImageUrl: (punch as any).selfieImageUrl,
          remarks: (punch as any).remarks,
          createdAt: punch.createdAt?.toISOString(),
        }
      }),
    )

    return punchesWithDetails
  }

  async findOne(id: string) {
    const punch = await this.prisma.gPSPunch.findUnique({
      where: { id },
      include: {
        employeeMaster: true,
        project: true,
        geofenceArea: true,
      },
    })

    if (!punch) {
      throw new NotFoundException(`GPS Punch with ID ${id} not found`)
    }

    let departmentName = 'Not assigned'
    let designationName = 'Not assigned'

    if (punch.employeeMaster?.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: punch.employeeMaster.departmentId },
      })
      departmentName = department?.departmentName || 'Not assigned'
    }

    if (punch.employeeMaster?.designationId) {
      const designation = await this.prisma.designation.findUnique({
        where: { id: punch.employeeMaster.designationId },
      })
      designationName = designation?.designationName || 'Not assigned'
    }

    const ist = utcToIST(punch.punchTime)
    return {
      id: punch.id,
      employeeId: punch.employeeMasterId,
      employeeCode: punch.employeeMaster?.employeeCode || '',
      employeeName: punch.employeeMaster
        ? `${punch.employeeMaster.firstName} ${punch.employeeMaster.lastName}`
        : 'Unknown',
      department: departmentName,
      designation: designationName,
      projectId: punch.projectId,
      projectName: punch.project?.name,
      projectCode: punch.project?.code,
      geofenceId: punch.geofenceAreaId,
      geofenceName: punch.geofenceArea?.geofenceName,
      punchType: punch.punchType,
      punchTime: punch.punchTime.toISOString(),
      punchDateIST: ist.dateStr,
      punchTimeIST: ist.timeStr,
      latitude: punch.latitude,
      longitude: punch.longitude,
      location: punch.location,
      distance: punch.distance,
      status: punch.status,
      accuracy: punch.accuracy,
      selfieImageUrl: (punch as any).selfieImageUrl,
      remarks: (punch as any).remarks,
      createdAt: punch.createdAt?.toISOString(),
    }
  }

  async update(id: string, updateDto: UpdateGPSPunchDto) {
    const existing = await this.prisma.gPSPunch.findUnique({
      where: { id },
    })

    if (!existing) {
      throw new NotFoundException(`GPS Punch with ID ${id} not found`)
    }

    const updateData: any = { ...updateDto }
    delete updateData.punchDateTime
    delete updateData.punchTime

    // Canonical punch time: punchDateTime (UTC) only
    if (updateDto.punchDateTime) {
      const parsed = parseUTCISO(updateDto.punchDateTime)
      if (!parsed) {
        throw new BadRequestException('punchDateTime must be a valid UTC ISO 8601 string')
      }
      updateData.punchTime = parsed
    } else if (updateDto.punchTime) {
      const parsed = new Date(updateDto.punchTime)
      if (!isNaN(parsed.getTime())) {
        updateData.punchTime = parsed
      }
    }

    const updated = await this.prisma.gPSPunch.update({
      where: { id },
      data: updateData,
      include: {
        employeeMaster: true,
        project: true,
        geofenceArea: true,
      },
    })

    return this.findOne(id)
  }

  async remove(id: string) {
    const existing = await this.prisma.gPSPunch.findUnique({
      where: { id },
    })

    if (!existing) {
      throw new NotFoundException(`GPS Punch with ID ${id} not found`)
    }

    await this.prisma.gPSPunch.delete({
      where: { id },
    })

    return { message: 'GPS Punch deleted successfully' }
  }

  async getStatistics(
    employeeMasterId?: string,
    projectId?: string,
    startDate?: string,
    endDate?: string,
  ) {
    const where: any = {}

    if (employeeMasterId) where.employeeMasterId = employeeMasterId
    if (projectId && projectId !== 'all') where.projectId = projectId

    if (startDate || endDate) {
      where.punchTime = {}
      if (startDate) where.punchTime.gte = new Date(startDate)
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        where.punchTime.lte = end
      }
    }

    const [total, valid, invalid, outsideGeofence, punchIns, punchOuts] = await Promise.all([
      this.prisma.gPSPunch.count({ where }),
      this.prisma.gPSPunch.count({ where: { ...where, status: 'VALID' } }),
      this.prisma.gPSPunch.count({ where: { ...where, status: 'INVALID' } }),
      this.prisma.gPSPunch.count({ where: { ...where, status: 'OUTSIDE_GEOFENCE' } }),
      this.prisma.gPSPunch.count({ where: { ...where, punchType: 'IN' } }),
      this.prisma.gPSPunch.count({ where: { ...where, punchType: 'OUT' } }),
    ])

    return {
      total,
      valid,
      invalid,
      outsideGeofence,
      punchIns,
      punchOuts,
      validPercentage: total > 0 ? ((valid / total) * 100).toFixed(1) : '0',
    }
  }

  async getTodayPunches(employeeMasterId?: string) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const where: any = {
      punchTime: {
        gte: today,
        lt: tomorrow,
      },
    }

    if (employeeMasterId) where.employeeMasterId = employeeMasterId

    const punches = await this.prisma.gPSPunch.findMany({
      where,
      include: {
        employeeMaster: true,
        project: true,
        geofenceArea: true,
      },
      orderBy: { punchTime: 'desc' },
    })

    // Fetch department and designation data for each employee, then format with IST
    const punchesWithDetails = await Promise.all(
      punches.map(async (punch) => {
        let departmentName = 'Not assigned'
        let designationName = 'Not assigned'

        if (punch.employeeMaster?.departmentId) {
          const department = await this.prisma.department.findUnique({
            where: { id: punch.employeeMaster.departmentId },
          })
          departmentName = department?.departmentName || 'Not assigned'
        }

        if (punch.employeeMaster?.designationId) {
          const designation = await this.prisma.designation.findUnique({
            where: { id: punch.employeeMaster.designationId },
          })
          designationName = designation?.designationName || 'Not assigned'
        }

        const ist = utcToIST(punch.punchTime)
        return {
          id: punch.id,
          employeeId: punch.employeeMasterId,
          employeeCode: punch.employeeMaster?.employeeCode || '',
          employeeName: punch.employeeMaster
            ? `${punch.employeeMaster.firstName} ${punch.employeeMaster.lastName}`
            : 'Unknown',
          department: departmentName,
          designation: designationName,
          projectId: punch.projectId,
          projectName: punch.project?.name,
          projectCode: punch.project?.code,
          geofenceId: punch.geofenceAreaId,
          geofenceName: punch.geofenceArea?.geofenceName,
          punchType: punch.punchType,
          punchTime: punch.punchTime.toISOString(),
          punchDateIST: ist.dateStr,
          punchTimeIST: ist.timeStr,
          latitude: punch.latitude,
          longitude: punch.longitude,
          location: punch.location,
          distance: punch.distance,
          status: punch.status,
          accuracy: punch.accuracy,
          selfieImageUrl: (punch as any).selfieImageUrl,
          remarks: (punch as any).remarks,
          createdAt: punch.createdAt?.toISOString(),
        }
      }),
    )

    return punchesWithDetails
  }
}
