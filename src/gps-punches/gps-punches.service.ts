import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateGPSPunchDto } from './dto/create-gps-punch.dto'

@Injectable()
export class GPSPunchesService {
  private readonly logger = new Logger(GPSPunchesService.name)

  constructor(private prisma: PrismaService) {}

  // Helper to truncate base64 URLs for logging
  private truncateUrl(url?: string): string {
    if (!url) return 'none'
    if (url.startsWith('data:image')) {
      return `${url.substring(0, 50)}...[${url.length} chars]`
    }
    return url.length > 100 ? `${url.substring(0, 100)}...` : url
  }

  async create(createDto: CreateGPSPunchDto) {
    // Parse punchTime - handle both ISO strings and time-only strings (HH:mm:ss)
    let punchTimeDate = new Date()
    if (createDto.punchTime) {
      const parsed = new Date(createDto.punchTime)
      if (!isNaN(parsed.getTime())) {
        // Valid ISO date string
        punchTimeDate = parsed
      } else if (/^\d{2}:\d{2}:\d{2}$/.test(createDto.punchTime)) {
        // Time-only string (HH:mm:ss) - combine with today's date
        const today = new Date()
        const [hours, minutes, seconds] = createDto.punchTime.split(':').map(Number)
        today.setHours(hours, minutes, seconds, 0)
        punchTimeDate = today
      }
    }

    // Extract punchTime from DTO to avoid it being spread as a string
    const { punchTime: _punchTimeStr, ...restOfDto } = createDto

    this.logger.log(
      `Creating GPS punch: ${createDto.punchType} at ${punchTimeDate.toISOString()}, selfie: ${this.truncateUrl(createDto.selfieImageUrl)}`,
    )

    return this.prisma.gPSPunch.create({
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
}
