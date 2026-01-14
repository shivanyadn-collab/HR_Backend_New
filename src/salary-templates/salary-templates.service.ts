import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateSalaryTemplateDto } from './dto/create-salary-template.dto'
import { UpdateSalaryTemplateDto } from './dto/update-salary-template.dto'
import { Prisma } from '@prisma/client'

interface SalaryCalculationContext {
  CTC?: number
  Basic?: number
  HRA?: number
  Conveyance?: number
  LTA?: number
  Medical?: number
  [key: string]: number | undefined
}

@Injectable()
export class SalaryTemplatesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Evaluate a salary component formula
   * Supports Excel-like formulas with variables like CTC, Basic, etc.
   */
  private evaluateFormula(formula: string, context: SalaryCalculationContext): number {
    if (!formula || !formula.trim()) {
      return 0
    }

    const cleanFormula = formula.trim()

    // If it's just a number, return it
    if (!isNaN(Number(cleanFormula))) {
      return Number(cleanFormula)
    }

    // If it starts with '=', treat it as a formula
    if (cleanFormula.startsWith('=')) {
      return this.evaluateExpression(cleanFormula.substring(1), context)
    }

    // If it's a reference to another component, return its value
    if (context[cleanFormula] !== undefined) {
      return context[cleanFormula]!
    }

    // Try to evaluate as a simple expression
    return this.evaluateExpression(cleanFormula, context)
  }

  /**
   * Evaluate mathematical expressions with variables
   */
  private evaluateExpression(expression: string, context: SalaryCalculationContext): number {
    try {
      // Replace variable names with their values
      let processedExpression = expression

      // Sort variable names by length (longest first) to avoid partial replacements
      const sortedKeys = Object.keys(context).sort((a, b) => b.length - a.length)

      for (const key of sortedKeys) {
        const value = context[key]
        if (value !== undefined) {
          // Use word boundaries to avoid partial replacements
          const regex = new RegExp(`\\b${key}\\b`, 'g')
          processedExpression = processedExpression.replace(regex, value.toString())
        }
      }

      // Replace common salary variables (case insensitive)
      processedExpression = processedExpression.replace(/\bCTC\b/gi, context.CTC?.toString() || '0')
      processedExpression = processedExpression.replace(/\bBasic\b/gi, context.Basic?.toString() || '0')
      processedExpression = processedExpression.replace(/\bHRA\b/gi, context.HRA?.toString() || '0')
      processedExpression = processedExpression.replace(/\bConveyance\b/gi, context.Conveyance?.toString() || '0')
      processedExpression = processedExpression.replace(/\bLTA\b/gi, context.LTA?.toString() || '0')
      processedExpression = processedExpression.replace(/\bMedical\b/gi, context.Medical?.toString() || '0')

      // Evaluate the mathematical expression
      // Note: In production, you'd want to use a safer expression evaluator
      // For now, using Function constructor (be careful with this in production)
      const result = new Function('return ' + processedExpression)()

      if (typeof result === 'number' && !isNaN(result)) {
        return Math.round(result * 100) / 100 // Round to 2 decimal places
      }

      throw new Error('Invalid formula result')
    } catch (error) {
      console.error('Formula evaluation error:', error)
      throw new BadRequestException(`Invalid formula: ${expression}`)
    }
  }

  /**
   * Calculate all components for a salary template
   */
  calculateSalaryComponents(components: any[], ctc: number): any[] {
    const context: SalaryCalculationContext = { CTC: ctc }
    const calculatedComponents = []

    // First pass: calculate components that don't depend on others
    for (const component of components) {
      if (!component.formula) {
        // Fixed value component
        calculatedComponents.push({
          ...component,
          calculatedValue: typeof component.value === 'number' ? component.value : 0
        })
        // Add to context for other formulas to reference
        context[component.name] = typeof component.value === 'number' ? component.value : 0
      }
    }

    // Second pass: calculate formula-based components
    for (const component of components) {
      if (component.formula) {
        const calculatedValue = this.evaluateFormula(component.formula, context)
        calculatedComponents.push({
          ...component,
          calculatedValue
        })
        // Add to context for other formulas to reference
        context[component.name] = calculatedValue
      }
    }

    return calculatedComponents
  }

  async create(createSalaryTemplateDto: CreateSalaryTemplateDto) {
    // Check if template code already exists
    const existing = await this.prisma.salaryTemplate.findUnique({
      where: { templateCode: createSalaryTemplateDto.templateCode },
    })

    if (existing) {
      throw new BadRequestException('Template code already exists')
    }

    return this.prisma.salaryTemplate.create({
      data: {
        ...createSalaryTemplateDto,
        components: createSalaryTemplateDto.components as unknown as Prisma.InputJsonValue,
        isActive: createSalaryTemplateDto.isActive ?? true,
      },
    })
  }

  async findAll(isActive?: boolean) {
    const where = isActive !== undefined ? { isActive } : {}
    const templates = await this.prisma.salaryTemplate.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
    })

    // Calculate actual employee count for each template from EmployeeMaster
    const templatesWithCounts = await Promise.all(
      templates.map(async (template) => {
        // Count employees using this salary template (only active employees)
        const employeeCount = await this.prisma.employeeMaster.count({
          where: {
            salaryTemplateId: template.id,
            status: 'ACTIVE', // EmployeeMasterStatus enum value
          },
        })

        return {
          ...template,
          employeeCount, // Use calculated count
        }
      })
    )

    return templatesWithCounts
  }

  async findActiveForAssignment() {
    const templates = await this.prisma.salaryTemplate.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        templateName: 'asc',
      },
      select: {
        id: true,
        templateName: true,
        templateCode: true,
        templateType: true,
        description: true,
        components: true,
      },
    })

    // Calculate actual employee count for each template from EmployeeMaster
    const templatesWithCounts = await Promise.all(
      templates.map(async (template) => {
        const employeeCount = await this.prisma.employeeMaster.count({
          where: {
            salaryTemplateId: template.id,
            status: 'ACTIVE',
          },
        })

        return {
          ...template,
          employeeCount,
        }
      })
    )

    return templatesWithCounts
  }

  async findOne(id: string) {
    const template = await this.prisma.salaryTemplate.findUnique({
      where: { id },
    })

    if (!template) {
      throw new NotFoundException('Salary template not found')
    }

    // Calculate actual employee count from EmployeeMaster
    const employeeCount = await this.prisma.employeeMaster.count({
      where: {
        salaryTemplateId: template.id,
        status: 'ACTIVE', // EmployeeMasterStatus enum value
      },
    })

    return {
      ...template,
      employeeCount, // Use calculated count
    }
  }

  async update(id: string, updateSalaryTemplateDto: UpdateSalaryTemplateDto) {
    const template = await this.prisma.salaryTemplate.findUnique({
      where: { id },
    })

    if (!template) {
      throw new NotFoundException('Salary template not found')
    }

    // Check if template code is being updated and if it conflicts
    if (updateSalaryTemplateDto.templateCode && updateSalaryTemplateDto.templateCode !== template.templateCode) {
      const existing = await this.prisma.salaryTemplate.findUnique({
        where: { templateCode: updateSalaryTemplateDto.templateCode },
      })

      if (existing) {
        throw new BadRequestException('Template code already exists')
      }
    }

    const updateData: any = { ...updateSalaryTemplateDto }
    if (updateSalaryTemplateDto.components) {
      updateData.components = updateSalaryTemplateDto.components as unknown as Prisma.InputJsonValue
    }

    return this.prisma.salaryTemplate.update({
      where: { id },
      data: updateData,
    })
  }

  async remove(id: string) {
    const template = await this.prisma.salaryTemplate.findUnique({
      where: { id },
    })

    if (!template) {
      throw new NotFoundException('Salary template not found')
    }

    // Check if any active employees are using this template before deletion
    const employeeCount = await this.prisma.employeeMaster.count({
      where: {
        salaryTemplateId: template.id,
        status: 'ACTIVE', // Only count active employees
      },
    })

    if (employeeCount > 0) {
      throw new BadRequestException(`Cannot delete template. ${employeeCount} active employee(s) are using this template.`)
    }

    return this.prisma.salaryTemplate.delete({
      where: { id },
    })
  }

  async toggleActive(id: string) {
    const template = await this.prisma.salaryTemplate.findUnique({
      where: { id },
    })

    if (!template) {
      throw new NotFoundException('Salary template not found')
    }

    const updatedTemplate = await this.prisma.salaryTemplate.update({
      where: { id },
      data: { isActive: !template.isActive },
    })

    // Calculate actual employee count from EmployeeMaster
    const employeeCount = await this.prisma.employeeMaster.count({
      where: {
        salaryTemplateId: updatedTemplate.id,
        status: 'ACTIVE', // EmployeeMasterStatus enum value
      },
    })

    return {
      ...updatedTemplate,
      employeeCount, // Include calculated count in response
    }
  }

  /**
   * Calculate salary breakdown for a specific template and CTC
   */
  async calculateSalary(templateId: string, ctc: number) {
    const template = await this.prisma.salaryTemplate.findUnique({
      where: { id: templateId },
    })

    if (!template) {
      throw new NotFoundException('Salary template not found')
    }

    if (!template.isActive) {
      throw new BadRequestException('Template is not active')
    }

    const components = template.components as any[]
    const calculatedComponents = this.calculateSalaryComponents(components, ctc)

    // Calculate totals
    const earnings = calculatedComponents.filter(c => c.type === 'earning' && c.isActive !== false)
    const deductions = calculatedComponents.filter(c => c.type === 'deduction' && c.isActive !== false)
    const contributions = calculatedComponents.filter(c => c.type === 'contribution' && c.isActive !== false)

    const totalEarnings = earnings.reduce((sum, c) => sum + (c.calculatedValue || 0), 0)
    const totalDeductions = deductions.reduce((sum, c) => sum + (c.calculatedValue || 0), 0)
    const totalContributions = contributions.reduce((sum, c) => sum + (c.calculatedValue || 0), 0)

    return {
      templateId: template.id,
      templateName: template.templateName,
      ctc,
      components: calculatedComponents,
      summary: {
        totalEarnings,
        totalDeductions,
        totalContributions,
        netSalary: totalEarnings - totalDeductions,
        grossSalary: totalEarnings
      }
    }
  }
}

