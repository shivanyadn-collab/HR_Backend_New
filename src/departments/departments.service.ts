import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateDepartmentDto } from './dto/create-department.dto'
import { UpdateDepartmentDto } from './dto/update-department.dto'

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  async create(createDepartmentDto: CreateDepartmentDto) {
    // Check if department code already exists
    const existing = await this.prisma.department.findUnique({
      where: { departmentCode: createDepartmentDto.departmentCode },
    })

    if (existing) {
      throw new Error('Department code already exists')
    }

    // Validate locationId if provided
    if (createDepartmentDto.locationId) {
      const location = await this.prisma.location.findUnique({
        where: { id: createDepartmentDto.locationId },
      })
      if (!location) {
        throw new Error('Location not found')
      }
    }

    return this.prisma.department.create({
      data: {
        ...createDepartmentDto,
        employeeCount: createDepartmentDto.employeeCount ?? 0,
        isActive: createDepartmentDto.isActive ?? true,
      },
    })
  }

  async findAll(isActive?: boolean) {
    const where = isActive !== undefined ? { isActive } : {}
    const departments = await this.prisma.department.findMany({
      where,
      include: {
        location: {
          select: {
            id: true,
            branchName: true,
            branchCode: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })
    
    // Calculate actual employee count for each department from EmployeeMaster
    const departmentsWithCounts = await Promise.all(
      departments.map(async (dept) => {
        // Count employees in this department
        const employeeCount = await this.prisma.employeeMaster.count({
          where: {
            departmentId: dept.id,
            status: 'ACTIVE', // Only count active employees
          },
        })
        
        // Update the department's employeeCount if it's different
        if (dept.employeeCount !== employeeCount) {
          await this.prisma.department.update({
            where: { id: dept.id },
            data: { employeeCount },
          })
        }
        
        return {
          ...dept,
          employeeCount, // Use calculated count
          locationId: dept.locationId || undefined,
        }
      })
    )
    
    return departmentsWithCounts
  }

  async findOne(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        location: {
          select: {
            id: true,
            branchName: true,
            branchCode: true,
          },
        },
      },
    })

    if (!department) {
      throw new NotFoundException('Department not found')
    }

    return department
  }

  async update(id: string, updateDepartmentDto: UpdateDepartmentDto) {
    const department = await this.prisma.department.findUnique({
      where: { id },
    })

    if (!department) {
      throw new NotFoundException('Department not found')
    }

    // Check if department code is being updated and if it conflicts
    if (updateDepartmentDto.departmentCode && updateDepartmentDto.departmentCode !== department.departmentCode) {
      const existing = await this.prisma.department.findUnique({
        where: { departmentCode: updateDepartmentDto.departmentCode },
      })

      if (existing) {
        throw new Error('Department code already exists')
      }
    }

    // Validate locationId if provided
    if (updateDepartmentDto.locationId) {
      const location = await this.prisma.location.findUnique({
        where: { id: updateDepartmentDto.locationId },
      })
      if (!location) {
        throw new Error('Location not found')
      }
    }

    return this.prisma.department.update({
      where: { id },
      data: updateDepartmentDto,
    })
  }

  async remove(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
    })

    if (!department) {
      throw new NotFoundException('Department not found')
    }

    return this.prisma.department.delete({
      where: { id },
    })
  }

  async toggleActive(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
    })

    if (!department) {
      throw new NotFoundException('Department not found')
    }

    return this.prisma.department.update({
      where: { id },
      data: { isActive: !department.isActive },
    })
  }
}

