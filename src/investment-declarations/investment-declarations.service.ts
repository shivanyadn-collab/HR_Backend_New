import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateInvestmentDeclarationDto } from './dto/create-investment-declaration.dto'
import { UpdateInvestmentDeclarationDto } from './dto/update-investment-declaration.dto'

@Injectable()
export class InvestmentDeclarationsService {
  constructor(private prisma: PrismaService) {}

  async create(createDto: CreateInvestmentDeclarationDto) {
    const declaration = await this.prisma.investmentDeclaration.create({
      data: {
        employeeMasterId: createDto.employeeMasterId,
        financialYear: createDto.financialYear,
        section: createDto.section,
        particulars: createDto.particulars,
        declaredAmount: createDto.declaredAmount ?? 0,
        proofSubmitted: createDto.proofSubmitted ?? false,
        verifiedAmount: createDto.verifiedAmount ?? 0,
        status: (createDto.status as any) || 'PENDING',
        proofDocumentUrl: createDto.proofDocumentUrl,
        verifiedBy: createDto.verifiedBy,
        verifiedDate: createDto.verifiedDate ? new Date(createDto.verifiedDate) : null,
        remarks: createDto.remarks,
      },
      include: {
        employeeMaster: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    })
    return this.formatResponse(declaration)
  }

  async findAll(employeeId?: string, financialYear?: string) {
    const where: any = {}
    if (employeeId) where.employeeMasterId = employeeId
    if (financialYear) where.financialYear = financialYear

    const declarations = await this.prisma.investmentDeclaration.findMany({
      where,
      include: {
        employeeMaster: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [{ section: 'asc' }, { createdAt: 'desc' }],
    })
    return declarations.map(this.formatResponse)
  }

  async findOne(id: string) {
    const declaration = await this.prisma.investmentDeclaration.findUnique({
      where: { id },
      include: {
        employeeMaster: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    })
    if (!declaration) {
      throw new NotFoundException(`Investment Declaration with ID ${id} not found`)
    }
    return this.formatResponse(declaration)
  }

  async update(id: string, updateDto: UpdateInvestmentDeclarationDto) {
    await this.findOne(id)
    const declaration = await this.prisma.investmentDeclaration.update({
      where: { id },
      data: {
        ...updateDto,
        verifiedDate: updateDto.verifiedDate ? new Date(updateDto.verifiedDate) : undefined,
        status: updateDto.status as any,
      },
      include: {
        employeeMaster: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    })
    return this.formatResponse(declaration)
  }

  async remove(id: string) {
    await this.findOne(id)
    await this.prisma.investmentDeclaration.delete({ where: { id } })
    return { message: 'Investment Declaration deleted successfully' }
  }

  async verify(id: string, verifiedBy: string, verifiedAmount: number, remarks?: string) {
    await this.findOne(id)
    const declaration = await this.prisma.investmentDeclaration.update({
      where: { id },
      data: {
        status: 'VERIFIED',
        verifiedBy,
        verifiedAmount,
        verifiedDate: new Date(),
        remarks,
      },
      include: {
        employeeMaster: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    })
    return this.formatResponse(declaration)
  }

  private formatResponse(declaration: any) {
    return {
      id: declaration.id,
      employeeMasterId: declaration.employeeMasterId,
      employeeName: declaration.employeeMaster
        ? `${declaration.employeeMaster.firstName} ${declaration.employeeMaster.lastName}`
        : null,
      employeeCode: declaration.employeeMaster?.employeeCode,
      financialYear: declaration.financialYear,
      section: declaration.section,
      particulars: declaration.particulars,
      declaredAmount: declaration.declaredAmount,
      proofSubmitted: declaration.proofSubmitted,
      verifiedAmount: declaration.verifiedAmount,
      status: declaration.status,
      proofDocumentUrl: declaration.proofDocumentUrl,
      verifiedBy: declaration.verifiedBy,
      verifiedDate: declaration.verifiedDate?.toISOString().split('T')[0],
      remarks: declaration.remarks,
      createdAt: declaration.createdAt,
      updatedAt: declaration.updatedAt,
    }
  }
}
