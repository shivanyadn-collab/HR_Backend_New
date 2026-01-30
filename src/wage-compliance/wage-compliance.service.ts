import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateMinimumWageDto } from './dto/create-minimum-wage.dto'
import { UpdateMinimumWageDto } from './dto/update-minimum-wage.dto'

interface SalaryComponent {
  name: string
  type: 'earning' | 'deduction' | 'contribution'
  calculationType: string
  value?: number | string
  isActive?: boolean
}

@Injectable()
export class WageComplianceService {
  constructor(private prisma: PrismaService) {}

  private calculateGrossWages(salaryTemplate: any): number {
    if (!salaryTemplate || !salaryTemplate.components) {
      return 0
    }

    try {
      const components = salaryTemplate.components as SalaryComponent[]
      let grossWages = 0

      for (const component of components) {
        if (
          component.type === 'earning' &&
          component.isActive !== false &&
          component.calculationType === 'fixed-amount' &&
          typeof component.value === 'number'
        ) {
          grossWages += component.value
        }
      }

      return grossWages
    } catch (error) {
      return 0
    }
  }

  async findAll(status?: string, state?: string, month?: string, search?: string) {
    // Get all active employees
    const employees = await this.prisma.employeeMaster.findMany({
      where: {
        status: 'ACTIVE',
        ...(search && {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { employeeCode: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      include: {
        department: true,
        designation: true,
        salaryTemplate: true,
      },
    })

    // Fetch minimum wage configurations from database
    const now = new Date()
    const minimumWageConfigs = await this.prisma.minimumWageConfiguration.findMany({
      where: {
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: now } },
        ],
      },
      orderBy: {
        effectiveFrom: 'desc',
      },
    })

    // Build minimum wage map from database
    const minimumWageMap: Record<string, Record<string, number>> = {}
    for (const config of minimumWageConfigs) {
      if (!minimumWageMap[config.state]) {
        minimumWageMap[config.state] = {}
      }
      // Use the most recent configuration for each state-category combination
      if (!minimumWageMap[config.state][config.category]) {
        minimumWageMap[config.state][config.category] = config.minimumWage
      }
    }

    const records = employees.map((emp) => {
      const actualWagePaid = this.calculateGrossWages(emp.salaryTemplate)
      const empState = emp.state || 'Maharashtra'
      // Determine category based on designation or default to 'Skilled'
      const category = emp.designation?.designationName?.toLowerCase().includes('unskilled')
        ? 'Unskilled'
        : emp.designation?.designationName?.toLowerCase().includes('semi')
          ? 'Semi-Skilled'
          : 'Skilled'
      // Get minimum wage from database, fallback to 0 if not configured
      const applicableMinimumWage = minimumWageMap[empState]?.[category] || 0
      const difference = actualWagePaid - applicableMinimumWage
      const complianceStatus = difference >= 0 ? 'Compliant' : 'Non-Compliant'

      return {
        id: emp.id,
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        employeeCode: emp.employeeCode,
        department: emp.department?.departmentName || 'N/A',
        designation: emp.designation?.designationName || 'N/A',
        state: empState,
        category,
        wageMonth: month || new Date().toISOString().slice(0, 7),
        applicableMinimumWage,
        actualWagePaid,
        difference,
        complianceStatus,
        remarks:
          difference >= 0
            ? 'Wage is above minimum wage requirement'
            : 'Wage is below minimum wage requirement. Action required.',
      }
    })

    // Filter by status if provided
    if (status && status !== 'all') {
      return records.filter((r) => r.complianceStatus === status)
    }

    // Filter by state if provided
    if (state && state !== 'all') {
      return records.filter((r) => r.state === state)
    }

    return records
  }

  // CRUD operations for Minimum Wage Configuration
  async createMinimumWage(createDto: CreateMinimumWageDto, createdBy?: string) {
    return this.prisma.minimumWageConfiguration.create({
      data: {
        ...createDto,
        effectiveFrom: createDto.effectiveFrom ? new Date(createDto.effectiveFrom) : new Date(),
        effectiveTo: createDto.effectiveTo ? new Date(createDto.effectiveTo) : null,
        createdBy,
      },
    })
  }

  async findAllMinimumWages() {
    return this.prisma.minimumWageConfiguration.findMany({
      orderBy: [
        { state: 'asc' },
        { category: 'asc' },
        { effectiveFrom: 'desc' },
      ],
    })
  }

  async findOneMinimumWage(id: string) {
    const config = await this.prisma.minimumWageConfiguration.findUnique({
      where: { id },
    })

    if (!config) {
      throw new NotFoundException(`Minimum wage configuration with ID ${id} not found`)
    }

    return config
  }

  async updateMinimumWage(id: string, updateDto: UpdateMinimumWageDto, updatedBy?: string) {
    await this.findOneMinimumWage(id) // Check if exists

    return this.prisma.minimumWageConfiguration.update({
      where: { id },
      data: {
        ...updateDto,
        effectiveFrom: updateDto.effectiveFrom ? new Date(updateDto.effectiveFrom) : undefined,
        effectiveTo: updateDto.effectiveTo ? new Date(updateDto.effectiveTo) : undefined,
        updatedBy,
      },
    })
  }

  async removeMinimumWage(id: string) {
    await this.findOneMinimumWage(id) // Check if exists

    return this.prisma.minimumWageConfiguration.delete({
      where: { id },
    })
  }

  async getStates() {
    const states = await this.prisma.minimumWageConfiguration.findMany({
      select: { state: true },
      distinct: ['state'],
      orderBy: { state: 'asc' },
    })
    return states.map((s) => s.state)
  }

  async getCategories() {
    return ['Skilled', 'Semi-Skilled', 'Unskilled']
  }
}
