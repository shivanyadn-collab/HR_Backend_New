import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateShiftDto } from './dto/create-shift.dto'
import { UpdateShiftDto } from './dto/update-shift.dto'

@Injectable()
export class ShiftsService {
  constructor(private prisma: PrismaService) {}

  async create(createShiftDto: CreateShiftDto) {
    // Check if shift code already exists
    const existing = await this.prisma.shift.findUnique({
      where: { shiftCode: createShiftDto.shiftCode },
    })

    if (existing) {
      throw new Error('Shift code already exists')
    }

    // Validate locationId if provided
    if (createShiftDto.locationId) {
      const location = await this.prisma.location.findUnique({
        where: { id: createShiftDto.locationId },
      })
      if (!location) {
        throw new Error('Location not found')
      }
    }

    // Validate departmentIds if provided
    if (createShiftDto.departmentIds && createShiftDto.departmentIds.length > 0) {
      for (const deptId of createShiftDto.departmentIds) {
        const department = await this.prisma.department.findUnique({
          where: { id: deptId },
        })
        if (!department) {
          throw new Error(`Department with id ${deptId} not found`)
        }
      }
    }

    // Validate designationIds if provided
    if (createShiftDto.designationIds && createShiftDto.designationIds.length > 0) {
      for (const desId of createShiftDto.designationIds) {
        const designation = await this.prisma.designation.findUnique({
          where: { id: desId },
        })
        if (!designation) {
          throw new Error(`Designation with id ${desId} not found`)
        }
      }
    }

    // Calculate total hours if not provided
    let totalHours = createShiftDto.totalHours
    if (!totalHours) {
      totalHours = this.calculateTotalHours(
        createShiftDto.startTime,
        createShiftDto.endTime,
        createShiftDto.breakDuration || 0
      )
    }

    return this.prisma.shift.create({
      data: {
        shiftName: createShiftDto.shiftName,
        shiftCode: createShiftDto.shiftCode,
        startTime: createShiftDto.startTime,
        endTime: createShiftDto.endTime,
        breakDuration: createShiftDto.breakDuration ?? 0,
        totalHours,
        shiftType: createShiftDto.shiftType || null,
        isFlexible: createShiftDto.isFlexible ?? false,
        employeeCount: createShiftDto.employeeCount ?? 0,
        isActive: createShiftDto.isActive ?? true,
        workingDays: createShiftDto.workingDays,
        weekOffPattern: createShiftDto.weekOffPattern || null,
        saturdayPattern: createShiftDto.saturdayPattern || null,
        locationId: createShiftDto.locationId || null,
        departmentIds: createShiftDto.departmentIds || [],
        designationIds: createShiftDto.designationIds || [],
      } as any,
    })
  }

  async findAll(isActive?: boolean) {
    const where = isActive !== undefined ? { isActive } : {}
    const shifts = await this.prisma.shift.findMany({
      where,
      include: {
        location: {
          select: {
            id: true,
            branchName: true,
            branchCode: true,
          },
        },
      } as any,
      orderBy: {
        createdAt: 'desc',
      },
    }) as any[]

    // Fetch departments and designations for each shift
    const allDepartmentIds = new Set<string>()
    const allDesignationIds = new Set<string>()
    
    shifts.forEach((shift: any) => {
      if (shift.departmentIds && Array.isArray(shift.departmentIds)) {
        shift.departmentIds.forEach((id: string) => allDepartmentIds.add(id))
      }
      if (shift.designationIds && Array.isArray(shift.designationIds)) {
        shift.designationIds.forEach((id: string) => allDesignationIds.add(id))
      }
    })

    const departments = await this.prisma.department.findMany({
      where: { id: { in: Array.from(allDepartmentIds) } },
      select: {
        id: true,
        departmentName: true,
        departmentCode: true,
        locationId: true,
      },
    })

    const designations = await this.prisma.designation.findMany({
      where: { id: { in: Array.from(allDesignationIds) } },
      select: {
        id: true,
        designationName: true,
        designationCode: true,
        department: true,
      },
    })

    const departmentMap = new Map(departments.map(d => [d.id, d]))
    const designationMap = new Map(designations.map(d => [d.id, d]))

    // Calculate actual employee count for each shift and attach department/designation data
    const shiftsWithCounts = await Promise.all(
      shifts.map(async (shift: any) => {
        // Count employees directly assigned to this shift via EmployeeMaster.shiftId
        const directEmployeeCount = await this.prisma.employeeMaster.count({
          where: {
            shiftId: shift.id,
            status: 'ACTIVE', // EmployeeMasterStatus enum value
          },
        })
        
        // Count employees assigned through ShiftAssignment (project-based assignments)
        // Get unique employee IDs from active shift assignments
        const shiftAssignments = await this.prisma.shiftAssignment.findMany({
          where: {
            shiftId: shift.id,
            isActive: true,
            assignmentType: 'Employee',
            employeeId: { not: null },
            // Only count assignments that are currently active (no endDate or endDate in future)
            OR: [
              { endDate: null },
              { endDate: { gte: new Date() } }
            ]
          },
          select: {
            employeeId: true,
          },
        })
        
        // Get unique employee IDs from shift assignments
        const assignedEmployeeIds = new Set(
          shiftAssignments
            .map(sa => sa.employeeId)
            .filter(Boolean) as string[]
        )
        
        // Count EmployeeMaster records that match these Employee IDs
        // We need to match Employee.employeeId with EmployeeMaster.employeeCode
        let assignmentEmployeeCount = 0
        if (assignedEmployeeIds.size > 0) {
          // Get Employee records to find their employeeId values
          const employees = await this.prisma.employee.findMany({
            where: {
              id: { in: Array.from(assignedEmployeeIds) },
            },
            select: {
              employeeId: true,
            },
          })
          
          // Match Employee.employeeId with EmployeeMaster.employeeCode
          const employeeCodes = employees.map(e => e.employeeId).filter(Boolean)
          if (employeeCodes.length > 0) {
            // Count EmployeeMaster records that are NOT already counted in directEmployeeCount
            // (to avoid double-counting)
            assignmentEmployeeCount = await this.prisma.employeeMaster.count({
              where: {
                employeeCode: { in: employeeCodes },
                status: 'ACTIVE',
                // Exclude employees already counted via direct shiftId assignment
                shiftId: { not: shift.id },
              },
            })
          }
        }
        
        // Total count: direct assignments + project-based assignments (without double-counting)
        const employeeCount = directEmployeeCount + assignmentEmployeeCount
        
        // Update the shift's employeeCount in database if it's different
        if (shift.employeeCount !== employeeCount) {
          await this.prisma.shift.update({
            where: { id: shift.id },
            data: { employeeCount },
          })
        }
        
        return {
          ...shift,
          employeeCount, // Use calculated count
          departments: (shift.departmentIds || []).map((id: string) => departmentMap.get(id)).filter(Boolean),
          designations: (shift.designationIds || []).map((id: string) => designationMap.get(id)).filter(Boolean),
        }
      })
    )
    
    return shiftsWithCounts
  }

  async findOne(id: string) {
    const shift = await this.prisma.shift.findUnique({
      where: { id },
      include: {
        location: {
          select: {
            id: true,
            branchName: true,
            branchCode: true,
          },
        },
      } as any,
    }) as any

    if (!shift) {
      throw new NotFoundException('Shift not found')
    }

    // Fetch departments and designations
    const departmentIds = shift.departmentIds || []
    const designationIds = shift.designationIds || []

    const departments = departmentIds.length > 0 ? await this.prisma.department.findMany({
      where: { id: { in: departmentIds } },
      select: {
        id: true,
        departmentName: true,
        departmentCode: true,
        locationId: true,
      },
    }) : []

    const designations = designationIds.length > 0 ? await this.prisma.designation.findMany({
      where: { id: { in: designationIds } },
      select: {
        id: true,
        designationName: true,
        designationCode: true,
        department: true,
      },
    }) : []

    // Calculate actual employee count from EmployeeMaster (direct assignments)
    const directEmployeeCount = await this.prisma.employeeMaster.count({
      where: {
        shiftId: shift.id,
        status: 'ACTIVE', // EmployeeMasterStatus enum value
      },
    })
    
    // Count employees assigned through ShiftAssignment (project-based assignments)
    const shiftAssignments = await this.prisma.shiftAssignment.findMany({
      where: {
        shiftId: shift.id,
        isActive: true,
        assignmentType: 'Employee',
        employeeId: { not: null },
        OR: [
          { endDate: null },
          { endDate: { gte: new Date() } }
        ]
      },
      select: {
        employeeId: true,
      },
    })
    
    let assignmentEmployeeCount = 0
    if (shiftAssignments.length > 0) {
      const assignedEmployeeIds = new Set(
        shiftAssignments.map(sa => sa.employeeId).filter(Boolean) as string[]
      )
      
      const employees = await this.prisma.employee.findMany({
        where: {
          id: { in: Array.from(assignedEmployeeIds) },
        },
        select: {
          employeeId: true,
        },
      })
      
      const employeeCodes = employees.map(e => e.employeeId).filter(Boolean)
      if (employeeCodes.length > 0) {
        assignmentEmployeeCount = await this.prisma.employeeMaster.count({
          where: {
            employeeCode: { in: employeeCodes },
            status: 'ACTIVE',
            shiftId: { not: shift.id }, // Avoid double-counting
          },
        })
      }
    }
    
    const employeeCount = directEmployeeCount + assignmentEmployeeCount
    
    // Update the shift's employeeCount in database if it's different
    if (shift.employeeCount !== employeeCount) {
      await this.prisma.shift.update({
        where: { id: shift.id },
        data: { employeeCount },
      })
    }

    return {
      ...shift,
      employeeCount, // Use calculated count
      departments,
      designations,
    }
  }

  async update(id: string, updateShiftDto: UpdateShiftDto) {
    const shift = await this.prisma.shift.findUnique({
      where: { id },
    })

    if (!shift) {
      throw new NotFoundException('Shift not found')
    }

    // Check if shift code is being updated and if it conflicts
    if (updateShiftDto.shiftCode && updateShiftDto.shiftCode !== shift.shiftCode) {
      const existing = await this.prisma.shift.findUnique({
        where: { shiftCode: updateShiftDto.shiftCode },
      })

      if (existing) {
        throw new Error('Shift code already exists')
      }
    }

    // Validate locationId if provided
    if (updateShiftDto.locationId) {
      const location = await this.prisma.location.findUnique({
        where: { id: updateShiftDto.locationId },
      })
      if (!location) {
        throw new Error('Location not found')
      }
    }

    // Validate departmentIds if provided
    if (updateShiftDto.departmentIds && updateShiftDto.departmentIds.length > 0) {
      for (const deptId of updateShiftDto.departmentIds) {
        const department = await this.prisma.department.findUnique({
          where: { id: deptId },
        })
        if (!department) {
          throw new Error(`Department with id ${deptId} not found`)
        }
      }
    }

    // Validate designationIds if provided
    if (updateShiftDto.designationIds && updateShiftDto.designationIds.length > 0) {
      for (const desId of updateShiftDto.designationIds) {
        const designation = await this.prisma.designation.findUnique({
          where: { id: desId },
        })
        if (!designation) {
          throw new Error(`Designation with id ${desId} not found`)
        }
      }
    }

    // Recalculate total hours if time or break duration changed
    let totalHours = updateShiftDto.totalHours
    if (
      updateShiftDto.startTime ||
      updateShiftDto.endTime ||
      updateShiftDto.breakDuration !== undefined
    ) {
      const startTime = updateShiftDto.startTime || shift.startTime
      const endTime = updateShiftDto.endTime || shift.endTime
      const breakDuration = updateShiftDto.breakDuration ?? shift.breakDuration
      totalHours = this.calculateTotalHours(startTime, endTime, breakDuration)
    }

    const updateData: any = {
      ...(updateShiftDto.shiftName !== undefined && { shiftName: updateShiftDto.shiftName }),
      ...(updateShiftDto.shiftCode !== undefined && { shiftCode: updateShiftDto.shiftCode }),
      ...(updateShiftDto.startTime !== undefined && { startTime: updateShiftDto.startTime }),
      ...(updateShiftDto.endTime !== undefined && { endTime: updateShiftDto.endTime }),
      ...(updateShiftDto.breakDuration !== undefined && { breakDuration: updateShiftDto.breakDuration }),
      ...(updateShiftDto.shiftType !== undefined && { shiftType: updateShiftDto.shiftType || null }),
      ...(updateShiftDto.isFlexible !== undefined && { isFlexible: updateShiftDto.isFlexible }),
      ...(updateShiftDto.employeeCount !== undefined && { employeeCount: updateShiftDto.employeeCount }),
      ...(updateShiftDto.isActive !== undefined && { isActive: updateShiftDto.isActive }),
      ...(updateShiftDto.workingDays !== undefined && { workingDays: updateShiftDto.workingDays }),
      ...(updateShiftDto.weekOffPattern !== undefined && { weekOffPattern: updateShiftDto.weekOffPattern || null }),
      ...(updateShiftDto.saturdayPattern !== undefined && { saturdayPattern: updateShiftDto.saturdayPattern || null }),
      ...(updateShiftDto.locationId !== undefined && { locationId: updateShiftDto.locationId || null }),
      ...(updateShiftDto.departmentIds !== undefined && { departmentIds: updateShiftDto.departmentIds || [] }),
      ...(updateShiftDto.designationIds !== undefined && { designationIds: updateShiftDto.designationIds || [] }),
      ...(totalHours !== undefined && { totalHours }),
    }

    return this.prisma.shift.update({
      where: { id },
      data: updateData,
    })
  }

  async remove(id: string) {
    const shift = await this.prisma.shift.findUnique({
      where: { id },
    })

    if (!shift) {
      throw new NotFoundException('Shift not found')
    }

    return this.prisma.shift.delete({
      where: { id },
    })
  }

  async toggleActive(id: string) {
    const shift = await this.prisma.shift.findUnique({
      where: { id },
    })

    if (!shift) {
      throw new NotFoundException('Shift not found')
    }

    return this.prisma.shift.update({
      where: { id },
      data: { isActive: !shift.isActive },
    })
  }

  private calculateTotalHours(startTime: string, endTime: string, breakDuration: number): number {
    const [startHour, startMin] = startTime.split(':').map(Number)
    const [endHour, endMin] = endTime.split(':').map(Number)

    let startMinutes = startHour * 60 + startMin
    let endMinutes = endHour * 60 + endMin

    // Handle overnight shifts
    if (endMinutes < startMinutes) {
      endMinutes += 24 * 60
    }

    const totalMinutes = endMinutes - startMinutes - breakDuration
    return parseFloat((totalMinutes / 60).toFixed(1))
  }
}

