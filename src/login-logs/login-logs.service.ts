import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateLoginLogDto } from './dto/create-login-log.dto'
import { UpdateLoginLogDto } from './dto/update-login-log.dto'

@Injectable()
export class LoginLogsService {
  constructor(private prisma: PrismaService) {}

  async create(createDto: CreateLoginLogDto) {
    // Only validate user if userId is provided
    if (createDto.userId && createDto.userId !== 'unknown') {
      const user = await this.prisma.user.findUnique({
        where: { id: createDto.userId },
      })

      if (!user) {
        // If user not found but userId was provided, set to null
        createDto.userId = undefined
      }
    } else {
      // If userId is 'unknown' or not provided, set to null
      createDto.userId = undefined
    }

    const log = await this.prisma.loginLog.create({
      data: {
        userId: createDto.userId || undefined,
        userName: createDto.userName,
        userCode: createDto.userCode,
        email: createDto.email,
        ipAddress: createDto.ipAddress,
        device: createDto.device,
        browser: createDto.browser,
        location: createDto.location,
        status: createDto.status,
        failureReason: createDto.failureReason,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            employeeId: true,
            department: true,
            designation: true,
          },
        },
      },
    })

    return this.formatResponse(log)
  }

  async findAll(
    userId?: string,
    status?: string,
    startDate?: string,
    endDate?: string,
    search?: string,
  ) {
    const where: any = {}

    if (userId) {
      where.userId = userId
    }

    if (status) {
      where.status = status
    }

    if (startDate || endDate) {
      where.loginTime = {}
      if (startDate) {
        where.loginTime.gte = new Date(startDate)
      }
      if (endDate) {
        // Include the entire end date
        const endDateTime = new Date(endDate)
        endDateTime.setHours(23, 59, 59, 999)
        where.loginTime.lte = endDateTime
      }
    }

    if (search) {
      where.OR = [
        { userName: { contains: search, mode: 'insensitive' } },
        { userCode: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { ipAddress: { contains: search, mode: 'insensitive' } },
      ]
    }

    const logs = await this.prisma.loginLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            employeeId: true,
            department: true,
            designation: true,
          },
        },
      },
      orderBy: {
        loginTime: 'desc',
      },
    })

    return logs.map((log) => this.formatResponse(log))
  }

  async findOne(id: string) {
    const log = await this.prisma.loginLog.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            employeeId: true,
            department: true,
            designation: true,
          },
        },
      },
    })

    if (!log) {
      throw new NotFoundException('Login log not found')
    }

    return this.formatResponse(log)
  }

  async update(id: string, updateDto: UpdateLoginLogDto) {
    const log = await this.prisma.loginLog.findUnique({
      where: { id },
    })

    if (!log) {
      throw new NotFoundException('Login log not found')
    }

    const updatedLog = await this.prisma.loginLog.update({
      where: { id },
      data: {
        ...updateDto,
        logoutTime: updateDto.logoutTime ? new Date(updateDto.logoutTime) : undefined,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            employeeId: true,
            department: true,
            designation: true,
          },
        },
      },
    })

    return this.formatResponse(updatedLog)
  }

  async remove(id: string) {
    const log = await this.prisma.loginLog.findUnique({
      where: { id },
    })

    if (!log) {
      throw new NotFoundException('Login log not found')
    }

    await this.prisma.loginLog.delete({
      where: { id },
    })
  }

  async updateLogoutTime(userId: string, logoutTime: Date) {
    // Find the most recent active login log (no logout time) for this user
    const activeLog = await this.prisma.loginLog.findFirst({
      where: {
        userId,
        logoutTime: null,
        status: 'Success' as any, // Prisma enum value
      },
      orderBy: {
        loginTime: 'desc',
      },
    })

    if (activeLog) {
      return this.update(activeLog.id, {
        logoutTime: logoutTime.toISOString(),
      })
    }

    return null
  }

  private formatResponse(log: any) {
    return {
      id: log.id,
      userId: log.userId,
      userName: log.userName,
      userCode: log.userCode,
      email: log.email,
      loginTime: log.loginTime.toISOString(),
      logoutTime: log.logoutTime ? log.logoutTime.toISOString() : undefined,
      ipAddress: log.ipAddress,
      device: log.device,
      browser: log.browser,
      location: log.location,
      status: log.status,
      failureReason: log.failureReason,
      createdAt: log.createdAt.toISOString(),
      updatedAt: log.updatedAt.toISOString(),
    }
  }
}
