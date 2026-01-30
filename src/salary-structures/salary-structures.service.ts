import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateSalaryStructureDto } from './dto/create-salary-structure.dto'
import { UpdateSalaryStructureDto } from './dto/update-salary-structure.dto'

@Injectable()
export class SalaryStructuresService {
  constructor(private prisma: PrismaService) {}

  // Type assertion helper for Prisma client (temporary until TS server picks up generated types)
  private get prismaClient() {
    return this.prisma as any
  }

  async create(createDto: CreateSalaryStructureDto) {
    // Calculate totals
    const totalEarnings =
      createDto.basicSalary +
      createDto.hra +
      createDto.specialAllowance +
      createDto.transportAllowance +
      createDto.medicalAllowance +
      createDto.otherAllowances

    const totalDeductions =
      createDto.providentFund +
      createDto.esic +
      createDto.professionalTax +
      createDto.tds +
      createDto.otherDeductions

    const netSalary = totalEarnings - totalDeductions

    // Verify employee exists
    const employee = await this.prisma.employeeMaster.findUnique({
      where: { id: createDto.employeeMasterId },
    })

    if (!employee) {
      throw new NotFoundException(`Employee with ID ${createDto.employeeMasterId} not found`)
    }

    // Create salary structure
    const salaryStructure = await this.prismaClient.salaryStructure.create({
      data: {
        employeeMasterId: createDto.employeeMasterId,
        employeeName: createDto.employeeName,
        employeeCode: createDto.employeeCode,
        department: createDto.department,
        designation: createDto.designation,
        basicSalary: createDto.basicSalary,
        hra: createDto.hra,
        specialAllowance: createDto.specialAllowance,
        transportAllowance: createDto.transportAllowance,
        medicalAllowance: createDto.medicalAllowance,
        otherAllowances: createDto.otherAllowances,
        totalEarnings,
        providentFund: createDto.providentFund,
        esic: createDto.esic,
        professionalTax: createDto.professionalTax,
        tds: createDto.tds,
        otherDeductions: createDto.otherDeductions,
        totalDeductions,
        netSalary,
        effectiveDate: new Date(createDto.effectiveDate),
        status: 'Active',
        templateId: createDto.templateId || null,
      },
      include: {
        employeeMaster: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        template: {
          select: {
            id: true,
            templateName: true,
            templateCode: true,
          },
        },
      },
    })

    return this.formatResponse(salaryStructure)
  }

  async findAll(params?: { status?: string; search?: string }) {
    const where: any = {}

    if (params?.status && params.status !== 'all') {
      where.status = params.status
    }

    if (params?.search) {
      where.OR = [
        { employeeName: { contains: params.search, mode: 'insensitive' } },
        { employeeCode: { contains: params.search, mode: 'insensitive' } },
        { department: { contains: params.search, mode: 'insensitive' } },
        { designation: { contains: params.search, mode: 'insensitive' } },
      ]
    }

    const structures = await this.prismaClient.salaryStructure.findMany({
      where,
      include: {
        employeeMaster: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        template: {
          select: {
            id: true,
            templateName: true,
            templateCode: true,
          },
        },
      },
      orderBy: {
        effectiveDate: 'desc',
      },
    })

    return structures.map((s) => this.formatResponse(s))
  }

  async findOne(id: string) {
    const structure = await this.prismaClient.salaryStructure.findUnique({
      where: { id },
      include: {
        employeeMaster: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            email: true,
            department: {
              select: {
                departmentName: true,
              },
            },
            designation: {
              select: {
                designationName: true,
              },
            },
          },
        },
        template: {
          select: {
            id: true,
            templateName: true,
            templateCode: true,
            templateType: true,
          },
        },
      },
    })

    if (!structure) {
      throw new NotFoundException(`Salary structure with ID ${id} not found`)
    }

    return this.formatResponse(structure)
  }

  async update(id: string, updateDto: UpdateSalaryStructureDto) {
    const existing = await this.prismaClient.salaryStructure.findUnique({
      where: { id },
    })

    if (!existing) {
      throw new NotFoundException(`Salary structure with ID ${id} not found`)
    }

    // Calculate totals if any earnings/deductions are updated
    const basicSalary = updateDto.basicSalary ?? existing.basicSalary
    const hra = updateDto.hra ?? existing.hra
    const specialAllowance = updateDto.specialAllowance ?? existing.specialAllowance
    const transportAllowance = updateDto.transportAllowance ?? existing.transportAllowance
    const medicalAllowance = updateDto.medicalAllowance ?? existing.medicalAllowance
    const otherAllowances = updateDto.otherAllowances ?? existing.otherAllowances

    const providentFund = updateDto.providentFund ?? existing.providentFund
    const esic = updateDto.esic ?? existing.esic
    const professionalTax = updateDto.professionalTax ?? existing.professionalTax
    const tds = updateDto.tds ?? existing.tds
    const otherDeductions = updateDto.otherDeductions ?? existing.otherDeductions

    const totalEarnings =
      basicSalary + hra + specialAllowance + transportAllowance + medicalAllowance + otherAllowances

    const totalDeductions = providentFund + esic + professionalTax + tds + otherDeductions

    const netSalary = totalEarnings - totalDeductions

    const updated = await this.prismaClient.salaryStructure.update({
      where: { id },
      data: {
        ...updateDto,
        totalEarnings,
        totalDeductions,
        netSalary,
        effectiveDate: updateDto.effectiveDate ? new Date(updateDto.effectiveDate) : undefined,
      },
      include: {
        employeeMaster: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        template: {
          select: {
            id: true,
            templateName: true,
            templateCode: true,
          },
        },
      },
    })

    return this.formatResponse(updated)
  }

  async remove(id: string) {
    const structure = await this.prismaClient.salaryStructure.findUnique({
      where: { id },
    })

    if (!structure) {
      throw new NotFoundException(`Salary structure with ID ${id} not found`)
    }

    await this.prismaClient.salaryStructure.delete({
      where: { id },
    })

    return { message: 'Salary structure deleted successfully' }
  }

  private formatResponse(structure: any) {
    return {
      id: structure.id,
      employeeId: structure.employeeMasterId, // Map for frontend compatibility
      employeeMasterId: structure.employeeMasterId, // Keep original field too
      employeeName: structure.employeeName,
      employeeCode: structure.employeeCode,
      department: structure.department,
      designation: structure.designation,
      basicSalary: structure.basicSalary,
      hra: structure.hra,
      specialAllowance: structure.specialAllowance,
      transportAllowance: structure.transportAllowance,
      medicalAllowance: structure.medicalAllowance,
      otherAllowances: structure.otherAllowances,
      totalEarnings: structure.totalEarnings,
      providentFund: structure.providentFund,
      esic: structure.esic,
      professionalTax: structure.professionalTax,
      tds: structure.tds,
      otherDeductions: structure.otherDeductions,
      totalDeductions: structure.totalDeductions,
      netSalary: structure.netSalary,
      effectiveDate: structure.effectiveDate.toISOString().split('T')[0], // Format as YYYY-MM-DD
      status: structure.status as 'Active' | 'Inactive',
      templateId: structure.templateId,
    }
  }
}
