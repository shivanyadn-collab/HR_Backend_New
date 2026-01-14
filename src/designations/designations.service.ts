import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateDesignationDto } from './dto/create-designation.dto'
import { UpdateDesignationDto } from './dto/update-designation.dto'

@Injectable()
export class DesignationsService {
  constructor(private prisma: PrismaService) {}

  async create(createDesignationDto: CreateDesignationDto) {
    // Check if designation code already exists
    const existing = await this.prisma.designation.findUnique({
      where: { designationCode: createDesignationDto.designationCode },
    })

    if (existing) {
      throw new Error('Designation code already exists')
    }

    return this.prisma.designation.create({
      data: {
        ...createDesignationDto,
        employeeCount: createDesignationDto.employeeCount ?? 0,
        isActive: createDesignationDto.isActive ?? true,
      },
    })
  }

  async findAll(isActive?: boolean, department?: string) {
    const where: any = {}
    if (isActive !== undefined) {
      where.isActive = isActive
    }
    if (department) {
      where.department = department
    }
    const designations = await this.prisma.designation.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
    })
    
    // Calculate actual employee count for each designation from EmployeeMaster
    const designationsWithCounts = await Promise.all(
      designations.map(async (des) => {
        // Count employees with this designation (only active employees)
        const employeeCount = await this.prisma.employeeMaster.count({
          where: {
            designationId: des.id,
            status: 'ACTIVE', // EmployeeMasterStatus enum value
          },
        })
        
        // Update the designation's employeeCount in database if it's different
        if (des.employeeCount !== employeeCount) {
          await this.prisma.designation.update({
            where: { id: des.id },
            data: { employeeCount },
          })
        }
        
        return {
          ...des,
          employeeCount, // Use calculated count
        }
      })
    )
    
    return designationsWithCounts
  }

  async findOne(id: string) {
    const designation = await this.prisma.designation.findUnique({
      where: { id },
    })

    if (!designation) {
      throw new NotFoundException('Designation not found')
    }

    // Calculate actual employee count from EmployeeMaster
    const employeeCount = await this.prisma.employeeMaster.count({
      where: {
        designationId: designation.id,
        status: 'ACTIVE', // EmployeeMasterStatus enum value
      },
    })
    
    // Update the designation's employeeCount in database if it's different
    if (designation.employeeCount !== employeeCount) {
      await this.prisma.designation.update({
        where: { id: designation.id },
        data: { employeeCount },
      })
    }

    return {
      ...designation,
      employeeCount, // Use calculated count
    }
  }

  async update(id: string, updateDesignationDto: UpdateDesignationDto) {
    const designation = await this.prisma.designation.findUnique({
      where: { id },
    })

    if (!designation) {
      throw new NotFoundException('Designation not found')
    }

    // Check if designation code is being updated and if it conflicts
    if (updateDesignationDto.designationCode && updateDesignationDto.designationCode !== designation.designationCode) {
      const existing = await this.prisma.designation.findUnique({
        where: { designationCode: updateDesignationDto.designationCode },
      })

      if (existing) {
        throw new Error('Designation code already exists')
      }
    }

    return this.prisma.designation.update({
      where: { id },
      data: updateDesignationDto,
    })
  }

  async remove(id: string) {
    const designation = await this.prisma.designation.findUnique({
      where: { id },
    })

    if (!designation) {
      throw new NotFoundException('Designation not found')
    }

    return this.prisma.designation.delete({
      where: { id },
    })
  }

  async toggleActive(id: string) {
    const designation = await this.prisma.designation.findUnique({
      where: { id },
    })

    if (!designation) {
      throw new NotFoundException('Designation not found')
    }

    return this.prisma.designation.update({
      where: { id },
      data: { isActive: !designation.isActive },
    })
  }
}

