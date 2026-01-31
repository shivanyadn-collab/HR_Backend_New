import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateEmployeeAssetDto } from './dto/create-employee-asset.dto'
import { UpdateEmployeeAssetDto } from './dto/update-employee-asset.dto'

/** Map frontend dcType ("Returnable" | "NonReturnable") to Prisma enum value */
function dcTypeToDb(dcType: string | undefined): 'RETURNABLE' | 'NON_RETURNABLE' | undefined {
  if (!dcType) return undefined
  if (dcType === 'Returnable') return 'RETURNABLE'
  if (dcType === 'NonReturnable') return 'NON_RETURNABLE'
  return undefined
}

/** Map Prisma enum to frontend dcType */
function dcTypeToApi(dcType: string | null | undefined): 'Returnable' | 'NonReturnable' | null {
  if (!dcType) return null
  if (dcType === 'RETURNABLE') return 'Returnable'
  if (dcType === 'NON_RETURNABLE') return 'NonReturnable'
  return null
}

@Injectable()
export class EmployeeAssetsService {
  constructor(private prisma: PrismaService) {}

  async create(createDto: CreateEmployeeAssetDto) {
    const employee = await this.prisma.employeeMaster.findUnique({
      where: { id: createDto.employeeMasterId },
    })
    if (!employee) {
      throw new NotFoundException('Employee not found')
    }

    // Get department and designation names
    let departmentName = ''
    let designationName = ''

    if (employee.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: employee.departmentId },
      })
      departmentName = department?.departmentName || ''
    }

    if (employee.designationId) {
      const designation = await this.prisma.designation.findUnique({
        where: { id: employee.designationId },
      })
      designationName = designation?.designationName || ''
    }

    const assetItem = await this.prisma.assetItem.findUnique({
      where: { id: createDto.assetItemId },
    })
    if (!assetItem) {
      throw new NotFoundException('Asset item not found')
    }

    if (assetItem.availableQuantity < 1) {
      throw new NotFoundException('Asset not available')
    }

    // Server-side DC number: generate if not sent (DC-YYYYMMDD-NNNN)
    let issuanceDcNumber = createDto.issuanceDcNumber?.trim()
    if (!issuanceDcNumber) {
      issuanceDcNumber = await this.generateIssuanceDcNumber(
        createDto.issueDate ? new Date(createDto.issueDate) : new Date(),
      )
    }

    const asset = await this.prisma.employeeAsset.create({
      data: {
        employeeMasterId: createDto.employeeMasterId,
        assetItemId: createDto.assetItemId,
        serialNumber: createDto.serialNumber,
        issueDate: createDto.issueDate ? new Date(createDto.issueDate) : new Date(),
        expectedReturnDate: createDto.expectedReturnDate
          ? new Date(createDto.expectedReturnDate)
          : null,
        condition: createDto.condition || 'Excellent',
        warrantyExpiryDate: createDto.warrantyExpiryDate
          ? new Date(createDto.warrantyExpiryDate)
          : assetItem.warrantyExpiryDate,
        location: createDto.location || 'Office',
        remarks: createDto.remarks,
        issuedBy: createDto.issuedBy,
        dcType: dcTypeToDb(createDto.dcType),
        issuanceDcNumber,
        issuanceFormUrl: createDto.issuanceFormUrl,
        issuanceFormKey: createDto.issuanceFormKey,
      } as any,
      include: {
        employeeMaster: true,
        assetItem: true,
      },
    })

    // Update asset item quantities
    await this.prisma.assetItem.update({
      where: { id: createDto.assetItemId },
      data: {
        allocatedQuantity: { increment: 1 },
        availableQuantity: { decrement: 1 },
      },
    })

    return this.formatResponse(asset, departmentName, designationName)
  }

  async findAll(employeeMasterId?: string, status?: string, category?: string, search?: string) {
    const where: any = {}
    if (employeeMasterId) where.employeeMasterId = employeeMasterId
    if (status) where.status = status
    if (category) where.assetItem = { category }
    if (search) {
      where.OR = [
        { employeeMaster: { firstName: { contains: search, mode: 'insensitive' } } },
        { employeeMaster: { lastName: { contains: search, mode: 'insensitive' } } },
        { employeeMaster: { employeeCode: { contains: search, mode: 'insensitive' } } },
        { assetItem: { assetName: { contains: search, mode: 'insensitive' } } },
        { serialNumber: { contains: search, mode: 'insensitive' } },
      ]
    }

    const assets = await this.prisma.employeeAsset.findMany({
      where,
      include: {
        employeeMaster: true,
        assetItem: true,
      },
      orderBy: { issueDate: 'desc' },
    })

    // Fetch department and designation for each asset
    const formattedAssets = await Promise.all(
      assets.map(async (a) => {
        let departmentName = ''
        let designationName = ''

        if (a.employeeMaster.departmentId) {
          const department = await this.prisma.department.findUnique({
            where: { id: a.employeeMaster.departmentId },
          })
          departmentName = department?.departmentName || ''
        }

        if (a.employeeMaster.designationId) {
          const designation = await this.prisma.designation.findUnique({
            where: { id: a.employeeMaster.designationId },
          })
          designationName = designation?.designationName || ''
        }

        return this.formatResponse(a, departmentName, designationName)
      }),
    )

    return formattedAssets
  }

  async findOne(id: string) {
    const asset = await this.prisma.employeeAsset.findUnique({
      where: { id },
      include: {
        employeeMaster: true,
        assetItem: true,
      },
    })

    if (!asset) {
      throw new NotFoundException('Employee asset not found')
    }

    // Get department and designation names
    let departmentName = ''
    let designationName = ''

    if (asset.employeeMaster.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: asset.employeeMaster.departmentId },
      })
      departmentName = department?.departmentName || ''
    }

    if (asset.employeeMaster.designationId) {
      const designation = await this.prisma.designation.findUnique({
        where: { id: asset.employeeMaster.designationId },
      })
      designationName = designation?.designationName || ''
    }

    return this.formatResponse(asset, departmentName, designationName)
  }

  async update(id: string, updateDto: UpdateEmployeeAssetDto) {
    const asset = await this.prisma.employeeAsset.findUnique({ where: { id } })
    if (!asset) {
      throw new NotFoundException('Employee asset not found')
    }

    // Track status change for quantity updates
    const wasIssued = asset.status === 'ISSUED'
    const willBeReturned = updateDto.status === 'RETURNED'

    const updateData = {
      assetItemId: updateDto.assetItemId,
      serialNumber: updateDto.serialNumber,
      expectedReturnDate: updateDto.expectedReturnDate
        ? new Date(updateDto.expectedReturnDate)
        : undefined,
      status: updateDto.status,
      condition: updateDto.condition,
      warrantyExpiryDate: updateDto.warrantyExpiryDate
        ? new Date(updateDto.warrantyExpiryDate)
        : undefined,
      location: updateDto.location,
      remarks: updateDto.remarks,
      returnDate: updateDto.returnDate ? new Date(updateDto.returnDate) : undefined,
      returnedBy: updateDto.returnedBy,
      returnedDate: updateDto.returnDate ? new Date(updateDto.returnDate) : undefined,
      dcType: updateDto.dcType !== undefined ? dcTypeToDb(updateDto.dcType) : undefined,
      issuanceDcNumber: updateDto.issuanceDcNumber,
      issuanceFormUrl: updateDto.issuanceFormUrl,
      issuanceFormKey: updateDto.issuanceFormKey,
    }
    const updated = await this.prisma.employeeAsset.update({
      where: { id },
      data: updateData as any,
      include: {
        employeeMaster: true,
        assetItem: true,
      },
    })

    // Update asset item quantities based on status change
    // Handle return: ISSUED -> RETURNED
    if (wasIssued && willBeReturned) {
      // Asset is being returned: increment available, decrement allocated
      await this.prisma.assetItem.update({
        where: { id: asset.assetItemId },
        data: {
          allocatedQuantity: { decrement: 1 },
          availableQuantity: { increment: 1 },
        },
      })
    }
    // Handle re-issue: RETURNED -> ISSUED (or any other status -> ISSUED)
    else if (asset.status !== 'ISSUED' && updateDto.status === 'ISSUED') {
      // Asset is being issued: decrement available, increment allocated
      const assetItem = await this.prisma.assetItem.findUnique({
        where: { id: asset.assetItemId },
      })
      if (!assetItem) {
        throw new NotFoundException('Asset item not found')
      }
      if (assetItem.availableQuantity < 1) {
        throw new NotFoundException('Asset not available')
      }
      await this.prisma.assetItem.update({
        where: { id: asset.assetItemId },
        data: {
          allocatedQuantity: { increment: 1 },
          availableQuantity: { decrement: 1 },
        },
      })
    }
    // Handle status change from RETURNED to another status (like DAMAGED, LOST)
    // Don't change quantities in this case as it was already returned

    // Recalculate quantities to ensure sync (handles any edge cases)
    await this.recalculateQuantities(asset.assetItemId)

    // Get department and designation from employee (avoids relying on include type)
    let departmentName = ''
    let designationName = ''
    const employee = await this.prisma.employeeMaster.findUnique({
      where: { id: updated.employeeMasterId },
      select: { departmentId: true, designationId: true },
    })
    if (employee?.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: employee.departmentId },
      })
      departmentName = department?.departmentName || ''
    }
    if (employee?.designationId) {
      const designation = await this.prisma.designation.findUnique({
        where: { id: employee.designationId },
      })
      designationName = designation?.designationName || ''
    }

    return this.formatResponse(updated, departmentName, designationName)
  }

  async remove(id: string) {
    const asset = await this.prisma.employeeAsset.findUnique({ where: { id } })
    if (!asset) {
      throw new NotFoundException('Employee asset not found')
    }

    // Return asset to available
    await this.prisma.assetItem.update({
      where: { id: asset.assetItemId },
      data: {
        allocatedQuantity: { decrement: 1 },
        availableQuantity: { increment: 1 },
      },
    })

    await this.prisma.employeeAsset.delete({ where: { id } })
  }

  private formatResponse(asset: any, departmentName: string = '', designationName: string = '') {
    return {
      id: asset.id,
      employeeId: asset.employeeMasterId,
      employeeCode: asset.employeeMaster.employeeCode,
      employeeName: `${asset.employeeMaster.firstName} ${asset.employeeMaster.lastName}`,
      departmentName,
      designationName,
      assetItemId: asset.assetItemId,
      assetName: asset.assetItem.assetName,
      assetCode: asset.assetItem.assetCode,
      category: asset.assetItem.category,
      brand: asset.assetItem.brand,
      model: asset.assetItem.model,
      serialNumber: asset.serialNumber,
      issueDate: asset.issueDate.toISOString().split('T')[0],
      returnDate: asset.returnDate ? asset.returnDate.toISOString().split('T')[0] : null,
      expectedReturnDate: asset.expectedReturnDate
        ? asset.expectedReturnDate.toISOString().split('T')[0]
        : null,
      status:
        asset.status === 'ISSUED'
          ? 'Issued'
          : asset.status === 'RETURNED'
            ? 'Returned'
            : asset.status === 'LOST'
              ? 'Lost'
              : asset.status === 'DAMAGED'
                ? 'Damaged'
                : asset.status === 'UNDER_REPAIR'
                  ? 'Under Repair'
                  : 'Expired',
      condition: asset.condition,
      warrantyExpiryDate: asset.warrantyExpiryDate
        ? asset.warrantyExpiryDate.toISOString().split('T')[0]
        : null,
      location: asset.location,
      remarks: asset.remarks,
      issuedBy: asset.issuedBy,
      returnedBy: asset.returnedBy,
      returnedDate: asset.returnedDate ? asset.returnedDate.toISOString().split('T')[0] : null,
      dcType: dcTypeToApi(asset.dcType),
      issuanceDcNumber: asset.issuanceDcNumber ?? null,
      issuanceFormUrl: asset.issuanceFormUrl ?? null,
      issuanceFormKey: asset.issuanceFormKey ?? null,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    }
  }

  /** Generate unique issuance DC number: DC-YYYYMMDD-NNNN (sequence per day). */
  private async generateIssuanceDcNumber(issueDate: Date): Promise<string> {
    const yyyymmdd = issueDate.toISOString().slice(0, 10).replace(/-/g, '')
    const prefix = `DC-${yyyymmdd}-`
    const existing = await this.prisma.employeeAsset.findMany({
      where: { issuanceDcNumber: { startsWith: prefix } } as any,
      select: { issuanceDcNumber: true } as any,
    })
    let maxSeq = 0
    for (const row of existing) {
      const dcNum = (row as { issuanceDcNumber?: string | null }).issuanceDcNumber
      const num = dcNum?.slice(prefix.length)
      const n = parseInt(num ?? '0', 10)
      if (!Number.isNaN(n) && n > maxSeq) maxSeq = n
    }
    const seq = String(maxSeq + 1).padStart(4, '0')
    return `${prefix}${seq}`
  }

  // Helper method to recalculate and sync asset item quantities based on actual assignments
  // This fixes any inconsistencies in the database
  async recalculateQuantities(assetItemId: string) {
    const assetItem = await this.prisma.assetItem.findUnique({
      where: { id: assetItemId },
    })
    if (!assetItem) {
      throw new NotFoundException('Asset item not found')
    }

    // Count actual issued (active) assets
    const issuedCount = await this.prisma.employeeAsset.count({
      where: {
        assetItemId: assetItemId,
        status: 'ISSUED',
      },
    })

    // Calculate correct quantities based on total quantity
    const totalQuantity = assetItem.totalQuantity
    const allocatedQuantity = issuedCount
    const availableQuantity = Math.max(0, totalQuantity - allocatedQuantity)

    // Update the asset item with correct quantities
    await this.prisma.assetItem.update({
      where: { id: assetItemId },
      data: {
        allocatedQuantity: allocatedQuantity,
        availableQuantity: availableQuantity,
      },
    })

    return {
      totalQuantity,
      allocatedQuantity,
      availableQuantity,
    }
  }
}
