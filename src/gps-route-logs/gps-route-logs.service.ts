import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateGPSRouteLogDto } from './dto/create-gps-route-log.dto'
import { UpdateGPSRouteLogDto, AddWaypointDto } from './dto/update-gps-route-log.dto'

@Injectable()
export class GPSRouteLogsService {
  constructor(private prisma: PrismaService) {}

  async create(createDto: CreateGPSRouteLogDto) {
    const { waypoints, ...routeData } = createDto

    const route = await this.prisma.gPSRouteLog.create({
      data: {
        ...routeData,
        date: new Date(createDto.date),
        startTime: new Date(createDto.startTime),
        endTime: createDto.endTime ? new Date(createDto.endTime) : null,
        status: createDto.status || 'ACTIVE',
        waypoints: waypoints
          ? {
              create: waypoints.map((wp) => ({
                timestamp: new Date(wp.timestamp),
                latitude: wp.latitude,
                longitude: wp.longitude,
                location: wp.location,
                speed: wp.speed,
              })),
            }
          : undefined,
      },
      include: {
        employeeMaster: true,
        project: true,
        waypoints: {
          orderBy: { timestamp: 'asc' },
        },
      },
    })

    return this.formatRouteResponse(route)
  }

  async update(id: string, updateDto: UpdateGPSRouteLogDto) {
    const existing = await this.prisma.gPSRouteLog.findUnique({
      where: { id },
    })

    if (!existing) {
      throw new NotFoundException(`GPS Route Log with ID ${id} not found`)
    }

    const updateData: any = { ...updateDto }
    if (updateDto.date) updateData.date = new Date(updateDto.date)
    if (updateDto.startTime) updateData.startTime = new Date(updateDto.startTime)
    if (updateDto.endTime) updateData.endTime = new Date(updateDto.endTime)

    const route = await this.prisma.gPSRouteLog.update({
      where: { id },
      data: updateData,
      include: {
        employeeMaster: true,
        project: true,
        waypoints: {
          orderBy: { timestamp: 'asc' },
        },
      },
    })

    return this.formatRouteResponse(route)
  }

  async remove(id: string) {
    const existing = await this.prisma.gPSRouteLog.findUnique({
      where: { id },
    })

    if (!existing) {
      throw new NotFoundException(`GPS Route Log with ID ${id} not found`)
    }

    await this.prisma.gPSRouteLog.delete({
      where: { id },
    })

    return { message: 'GPS Route Log deleted successfully' }
  }

  async addWaypoints(addWaypointDto: AddWaypointDto) {
    const route = await this.prisma.gPSRouteLog.findUnique({
      where: { id: addWaypointDto.routeLogId },
    })

    if (!route) {
      throw new NotFoundException(`GPS Route Log with ID ${addWaypointDto.routeLogId} not found`)
    }

    await this.prisma.gPSRouteWaypoint.createMany({
      data: addWaypointDto.waypoints.map((wp) => ({
        routeLogId: addWaypointDto.routeLogId,
        timestamp: new Date(wp.timestamp),
        latitude: wp.latitude,
        longitude: wp.longitude,
        location: wp.location,
        speed: wp.speed,
      })),
    })

    return this.findOne(addWaypointDto.routeLogId)
  }

  async completeRoute(id: string, endLocation?: string, endLatitude?: number, endLongitude?: number) {
    const route = await this.prisma.gPSRouteLog.findUnique({
      where: { id },
      include: { waypoints: true },
    })

    if (!route) {
      throw new NotFoundException(`GPS Route Log with ID ${id} not found`)
    }

    // Calculate total duration
    const now = new Date()
    const totalDuration = Math.round((now.getTime() - route.startTime.getTime()) / 60000) // in minutes

    // Calculate total distance from waypoints (if available)
    let totalDistance = 0
    if (route.waypoints.length > 1) {
      for (let i = 1; i < route.waypoints.length; i++) {
        totalDistance += this.calculateDistance(
          route.waypoints[i - 1].latitude,
          route.waypoints[i - 1].longitude,
          route.waypoints[i].latitude,
          route.waypoints[i].longitude,
        )
      }
    }

    const updated = await this.prisma.gPSRouteLog.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        endTime: now,
        endLocation: endLocation || route.endLocation,
        endLatitude: endLatitude || route.endLatitude,
        endLongitude: endLongitude || route.endLongitude,
        totalDuration,
        totalDistance: totalDistance > 0 ? totalDistance : route.totalDistance,
      },
      include: {
        employeeMaster: true,
        project: true,
        waypoints: {
          orderBy: { timestamp: 'asc' },
        },
      },
    })

    return this.formatRouteResponse(updated)
  }

  // Haversine formula to calculate distance between two points
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371 // Earth's radius in km
    const dLat = this.deg2rad(lat2 - lat1)
    const dLon = this.deg2rad(lon2 - lon1)
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c // Distance in km
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180)
  }

  private async formatRouteResponse(route: any) {
    let departmentName = 'Not assigned'
    let designationName = 'Not assigned'

    if (route.employeeMaster?.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: route.employeeMaster.departmentId },
      })
      departmentName = department?.departmentName || 'Not assigned'
    }

    if (route.employeeMaster?.designationId) {
      const designation = await this.prisma.designation.findUnique({
        where: { id: route.employeeMaster.designationId },
      })
      designationName = designation?.designationName || 'Not assigned'
    }

    return {
      id: route.id,
      employeeId: route.employeeMasterId,
      employeeCode: route.employeeMaster?.employeeCode || '',
      employeeName: route.employeeMaster
        ? `${route.employeeMaster.firstName} ${route.employeeMaster.lastName}`
        : 'Unknown',
      department: departmentName,
      designation: designationName,
      projectId: route.projectId,
      projectName: route.project?.name,
      projectCode: route.project?.code,
      date: route.date.toISOString().split('T')[0],
      startTime: route.startTime.toISOString().split('T')[1].split('.')[0],
      endTime: route.endTime?.toISOString().split('T')[1].split('.')[0],
      startLocation: route.startLocation,
      endLocation: route.endLocation,
      startLatitude: route.startLatitude,
      startLongitude: route.startLongitude,
      endLatitude: route.endLatitude,
      endLongitude: route.endLongitude,
      totalDistance: route.totalDistance,
      totalDuration: route.totalDuration,
      waypoints: route.waypoints?.map((wp: any) => ({
        id: wp.id,
        timestamp: wp.timestamp.toISOString(),
        latitude: wp.latitude,
        longitude: wp.longitude,
        location: wp.location,
        speed: wp.speed,
      })) || [],
      waypointCount: route.waypoints?.length || 0,
      status: route.status,
    }
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
      where.date = {}
      if (startDate) where.date.gte = new Date(startDate)
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        where.date.lte = end
      }
    }

    const routes = await this.prisma.gPSRouteLog.findMany({
      where,
    })

    const total = routes.length
    const active = routes.filter((r) => r.status === 'ACTIVE').length
    const completed = routes.filter((r) => r.status === 'COMPLETED').length
    const paused = routes.filter((r) => r.status === 'PAUSED').length

    const totalDistance = routes.reduce((sum, r) => sum + (r.totalDistance || 0), 0)
    const totalDuration = routes.reduce((sum, r) => sum + (r.totalDuration || 0), 0)

    return {
      total,
      active,
      completed,
      paused,
      totalDistanceKm: totalDistance.toFixed(2),
      totalDurationMinutes: totalDuration,
      avgDistanceKm: total > 0 ? (totalDistance / total).toFixed(2) : '0',
      avgDurationMinutes: total > 0 ? Math.round(totalDuration / total) : 0,
    }
  }

  async findAll(
    employeeMasterId?: string,
    projectId?: string,
    status?: string,
    startDate?: string,
    endDate?: string,
    search?: string,
  ) {
    const where: any = {}

    if (employeeMasterId) where.employeeMasterId = employeeMasterId
    if (projectId && projectId !== 'all') where.projectId = projectId
    if (status && status !== 'all') where.status = status

    if (search) {
      where.OR = [
        { employeeMaster: { firstName: { contains: search, mode: 'insensitive' } } },
        { employeeMaster: { lastName: { contains: search, mode: 'insensitive' } } },
        { employeeMaster: { employeeCode: { contains: search, mode: 'insensitive' } } },
      ]
    }

    if (startDate || endDate) {
      where.date = {}
      if (startDate) where.date.gte = new Date(startDate)
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        where.date.lte = end
      }
    }

    const routes = await this.prisma.gPSRouteLog.findMany({
      where,
      include: {
        employeeMaster: true,
        project: true,
        waypoints: {
          orderBy: { timestamp: 'asc' },
        },
      },
      orderBy: { date: 'desc' },
    })

    // Fetch department and designation data for each employee
    const routesWithDetails = await Promise.all(
      routes.map(async (route) => {
        let departmentName = 'Not assigned'
        let designationName = 'Not assigned'

        if (route.employeeMaster?.departmentId) {
          const department = await this.prisma.department.findUnique({
            where: { id: route.employeeMaster.departmentId },
          })
          departmentName = department?.departmentName || 'Not assigned'
        }

        if (route.employeeMaster?.designationId) {
          const designation = await this.prisma.designation.findUnique({
            where: { id: route.employeeMaster.designationId },
          })
          designationName = designation?.designationName || 'Not assigned'
        }

        return {
          id: route.id,
          employeeId: route.employeeMasterId,
          employeeCode: route.employeeMaster?.employeeCode || '',
          employeeName: route.employeeMaster
            ? `${route.employeeMaster.firstName} ${route.employeeMaster.lastName}`
            : 'Unknown',
          department: departmentName,
          designation: designationName,
          projectId: route.projectId,
          projectName: route.project?.name,
          projectCode: route.project?.code,
          date: route.date.toISOString().split('T')[0],
          startTime: route.startTime.toISOString().split('T')[1].split('.')[0],
          endTime: route.endTime?.toISOString().split('T')[1].split('.')[0],
          startLocation: route.startLocation,
          endLocation: route.endLocation,
          startLatitude: route.startLatitude,
          startLongitude: route.startLongitude,
          endLatitude: route.endLatitude,
          endLongitude: route.endLongitude,
          totalDistance: route.totalDistance,
          totalDuration: route.totalDuration,
          waypoints: route.waypoints.length,
          status: route.status,
        }
      }),
    )

    return routesWithDetails
  }

  async findOne(id: string) {
    const route = await this.prisma.gPSRouteLog.findUnique({
      where: { id },
      include: {
        employeeMaster: true,
        project: true,
        waypoints: {
          orderBy: { timestamp: 'asc' },
        },
      },
    })

    if (!route) {
      return null
    }

    let departmentName = 'Not assigned'
    let designationName = 'Not assigned'

    if (route.employeeMaster?.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: route.employeeMaster.departmentId },
      })
      departmentName = department?.departmentName || 'Not assigned'
    }

    if (route.employeeMaster?.designationId) {
      const designation = await this.prisma.designation.findUnique({
        where: { id: route.employeeMaster.designationId },
      })
      designationName = designation?.designationName || 'Not assigned'
    }

    return {
      id: route.id,
      employeeId: route.employeeMasterId,
      employeeCode: route.employeeMaster?.employeeCode || '',
      employeeName: route.employeeMaster
        ? `${route.employeeMaster.firstName} ${route.employeeMaster.lastName}`
        : 'Unknown',
      department: departmentName,
      designation: designationName,
      projectId: route.projectId,
      projectName: route.project?.name,
      projectCode: route.project?.code,
      date: route.date.toISOString().split('T')[0],
      startTime: route.startTime.toISOString().split('T')[1].split('.')[0],
      endTime: route.endTime?.toISOString().split('T')[1].split('.')[0],
      startLocation: route.startLocation,
      endLocation: route.endLocation,
      startLatitude: route.startLatitude,
      startLongitude: route.startLongitude,
      endLatitude: route.endLatitude,
      endLongitude: route.endLongitude,
      totalDistance: route.totalDistance,
      totalDuration: route.totalDuration,
      waypoints: route.waypoints.map((wp) => ({
        id: wp.id,
        timestamp: wp.timestamp.toISOString().split('T')[1].split('.')[0],
        latitude: wp.latitude,
        longitude: wp.longitude,
        location: wp.location,
        speed: wp.speed,
      })),
      status: route.status,
    }
  }
}
