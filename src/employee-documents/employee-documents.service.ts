import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { BucketService } from '../bucket/bucket.service'
import { CreateEmployeeDocumentDto } from './dto/create-employee-document.dto'
import { UpdateEmployeeDocumentDto } from './dto/update-employee-document.dto'

@Injectable()
export class EmployeeDocumentsService {
  constructor(
    private prisma: PrismaService,
    private bucketService: BucketService,
  ) {}

  /** If fileUrl is a base64 data URL, uploads to S3 and returns { fileUrl, fileKey, fileSize }. Otherwise returns undefined. */
  private async normalizeFileUrlToS3(
    fileUrl: string | undefined,
    documentName: string,
  ): Promise<{ fileUrl: string; fileKey: string; fileSize: number } | undefined> {
    if (!fileUrl || !fileUrl.trim()) return undefined
    const match = fileUrl.match(/^data:([^;]+);base64,(.+)$/i)
    if (!match) {
      // Allow http(s) URLs (S3, etc.) or local bucket path from upload (e.g. /uploads/...)
      if (/^https?:\/\//i.test(fileUrl)) return undefined
      if (fileUrl.startsWith('/uploads/')) return undefined
      throw new BadRequestException(
        'fileUrl must be an S3/HTTP URL or a base64 data URL (data:...;base64,...). Use POST /employee-documents/upload for file uploads.',
      )
    }
    const mimeType = match[1].trim()
    const base64 = match[2]
    let buffer: Buffer
    try {
      buffer = Buffer.from(base64, 'base64')
    } catch {
      throw new BadRequestException('Invalid base64 in fileUrl')
    }
    if (!buffer.length) throw new BadRequestException('Empty file content in fileUrl')

    const ext = this.getExtensionFromMime(mimeType)
    const safeName = documentName.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 80) || 'document'
    const customFileName = `${safeName}-${Date.now()}${ext}`

    const file: Express.Multer.File = {
      buffer,
      mimetype: mimeType,
      originalname: customFileName,
      size: buffer.length,
      fieldname: 'file',
      encoding: '7bit',
      stream: null as any,
      destination: '',
      filename: '',
      path: '',
    }

    const uploadResult = await this.bucketService.uploadFile(file, 'employee-documents', customFileName)
    return {
      fileUrl: uploadResult.url,
      fileKey: uploadResult.key,
      fileSize: uploadResult.size,
    }
  }

  private getExtensionFromMime(mimeType: string): string {
    const map: Record<string, string> = {
      'application/pdf': '.pdf',
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
      'text/plain': '.txt',
    }
    return map[mimeType.toLowerCase()] ?? '.bin'
  }

  async create(createEmployeeDocumentDto: CreateEmployeeDocumentDto) {
    // Verify employee exists
    const employee = await this.prisma.employeeMaster.findUnique({
      where: { id: createEmployeeDocumentDto.employeeMasterId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
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

    const uploadDate = createEmployeeDocumentDto.uploadDate
      ? new Date(createEmployeeDocumentDto.uploadDate)
      : new Date()

    // Auto-upload base64 fileUrl to S3 and store only the URL
    const s3Result = createEmployeeDocumentDto.fileUrl
      ? await this.normalizeFileUrlToS3(
          createEmployeeDocumentDto.fileUrl,
          createEmployeeDocumentDto.documentName,
        )
      : undefined

    const document = await this.prisma.employeeDocument.create({
      data: {
        employeeMasterId: createEmployeeDocumentDto.employeeMasterId,
        documentName: createEmployeeDocumentDto.documentName,
        documentType: createEmployeeDocumentDto.documentType,
        documentCategory: createEmployeeDocumentDto.documentCategory,
        fileSize: s3Result?.fileSize ?? createEmployeeDocumentDto.fileSize,
        fileUrl: s3Result?.fileUrl ?? createEmployeeDocumentDto.fileUrl,
        fileKey: s3Result?.fileKey ?? createEmployeeDocumentDto.fileKey,
        uploadDate,
        expiryDate: createEmployeeDocumentDto.expiryDate
          ? new Date(createEmployeeDocumentDto.expiryDate)
          : null,
        uploadedBy: createEmployeeDocumentDto.uploadedBy,
        status: createEmployeeDocumentDto.status || 'ACTIVE',
        description: createEmployeeDocumentDto.description,
        version: createEmployeeDocumentDto.version || '1.0',
        isConfidential: createEmployeeDocumentDto.isConfidential || false,
      },
      include: {
        employeeMaster: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    })

    // Fetch user name if uploadedBy exists
    const userMap = new Map<string, string>()
    if (document.uploadedBy) {
      const user = await this.prisma.user.findUnique({
        where: { id: document.uploadedBy },
        select: { id: true, name: true },
      })
      if (user) {
        userMap.set(user.id, user.name)
      }
    }

    return this.formatDocumentResponse(document, departmentName, designationName, userMap)
  }

  async findAll(
    employeeMasterId?: string,
    documentCategory?: string,
    status?: string,
    search?: string,
  ) {
    const where: any = {}

    if (employeeMasterId) {
      where.employeeMasterId = employeeMasterId
    }

    if (documentCategory) {
      where.documentCategory = documentCategory
    }

    if (status) {
      where.status = status
    }

    if (search) {
      where.OR = [
        {
          documentName: { contains: search, mode: 'insensitive' },
        },
        {
          employeeMaster: {
            firstName: { contains: search, mode: 'insensitive' },
          },
        },
        {
          employeeMaster: {
            lastName: { contains: search, mode: 'insensitive' },
          },
        },
        {
          employeeMaster: {
            employeeCode: { contains: search, mode: 'insensitive' },
          },
        },
      ]
    }

    const documents = await this.prisma.employeeDocument.findMany({
      where,
      include: {
        employeeMaster: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: { uploadDate: 'desc' },
    })

    // Fetch user names for uploadedBy fields
    const userIds: string[] = documents
      .map((doc) => doc.uploadedBy)
      .filter((id): id is string => id !== null && id !== undefined)
    const uniqueUserIds = [...new Set(userIds)]

    const users =
      uniqueUserIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: uniqueUserIds } },
            select: { id: true, name: true },
          })
        : []

    const userMap = new Map(users.map((u) => [u.id, u.name]))

    // Format each response with department and designation names
    const formattedResults = await Promise.all(
      documents.map(async (doc) => {
        let departmentName = ''
        let designationName = ''

        if (doc.employeeMaster.departmentId) {
          const department = await this.prisma.department.findUnique({
            where: { id: doc.employeeMaster.departmentId },
          })
          departmentName = department?.departmentName || ''
        }

        if (doc.employeeMaster.designationId) {
          const designation = await this.prisma.designation.findUnique({
            where: { id: doc.employeeMaster.designationId },
          })
          designationName = designation?.designationName || ''
        }

        return this.formatDocumentResponse(doc, departmentName, designationName, userMap)
      }),
    )

    return formattedResults
  }

  async findOne(id: string) {
    const document = await this.prisma.employeeDocument.findUnique({
      where: { id },
      include: {
        employeeMaster: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    })

    if (!document) {
      throw new NotFoundException('Document not found')
    }

    // Get department and designation names
    let departmentName = ''
    let designationName = ''

    if (document.employeeMaster.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: document.employeeMaster.departmentId },
      })
      departmentName = department?.departmentName || ''
    }

    if (document.employeeMaster.designationId) {
      const designation = await this.prisma.designation.findUnique({
        where: { id: document.employeeMaster.designationId },
      })
      designationName = designation?.designationName || ''
    }

    // Fetch user name if uploadedBy exists
    const userMap = new Map<string, string>()
    if (document.uploadedBy) {
      const user = await this.prisma.user.findUnique({
        where: { id: document.uploadedBy },
        select: { id: true, name: true },
      })
      if (user) {
        userMap.set(user.id, user.name)
      }
    }

    return this.formatDocumentResponse(document, departmentName, designationName, userMap)
  }

  async update(id: string, updateEmployeeDocumentDto: UpdateEmployeeDocumentDto) {
    const document = await this.prisma.employeeDocument.findUnique({
      where: { id },
    })

    if (!document) {
      throw new NotFoundException('Document not found')
    }

    const updateData: any = {}

    if (updateEmployeeDocumentDto.documentName !== undefined) {
      updateData.documentName = updateEmployeeDocumentDto.documentName
    }

    if (updateEmployeeDocumentDto.documentCategory !== undefined) {
      updateData.documentCategory = updateEmployeeDocumentDto.documentCategory
    }

    if (updateEmployeeDocumentDto.expiryDate !== undefined) {
      updateData.expiryDate = updateEmployeeDocumentDto.expiryDate
        ? new Date(updateEmployeeDocumentDto.expiryDate)
        : null
    }

    if (updateEmployeeDocumentDto.status !== undefined) {
      updateData.status = updateEmployeeDocumentDto.status
    }

    if (updateEmployeeDocumentDto.description !== undefined) {
      updateData.description = updateEmployeeDocumentDto.description
    }

    if (updateEmployeeDocumentDto.version !== undefined) {
      updateData.version = updateEmployeeDocumentDto.version
    }

    if (updateEmployeeDocumentDto.isConfidential !== undefined) {
      updateData.isConfidential = updateEmployeeDocumentDto.isConfidential
    }

    // Check if document is expired
    if (
      document.expiryDate &&
      new Date(document.expiryDate) < new Date() &&
      updateData.status !== 'EXPIRED'
    ) {
      updateData.status = 'EXPIRED'
    }

    const updated = await this.prisma.employeeDocument.update({
      where: { id },
      data: updateData,
      include: {
        employeeMaster: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    })

    // Get department and designation names
    let departmentName = ''
    let designationName = ''

    if (updated.employeeMaster.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: updated.employeeMaster.departmentId },
      })
      departmentName = department?.departmentName || ''
    }

    if (updated.employeeMaster.designationId) {
      const designation = await this.prisma.designation.findUnique({
        where: { id: updated.employeeMaster.designationId },
      })
      designationName = designation?.designationName || ''
    }

    // Fetch user name if uploadedBy exists
    const userMap = new Map<string, string>()
    if (updated.uploadedBy) {
      const user = await this.prisma.user.findUnique({
        where: { id: updated.uploadedBy },
        select: { id: true, name: true },
      })
      if (user) {
        userMap.set(user.id, user.name)
      }
    }

    return this.formatDocumentResponse(updated, departmentName, designationName, userMap)
  }

  async archive(id: string) {
    const document = await this.prisma.employeeDocument.findUnique({
      where: { id },
    })

    if (!document) {
      throw new NotFoundException('Document not found')
    }

    const updated = await this.prisma.employeeDocument.update({
      where: { id },
      data: { status: 'ARCHIVED' },
      include: {
        employeeMaster: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    })

    // Get department and designation names
    let departmentName = ''
    let designationName = ''

    if (updated.employeeMaster.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: updated.employeeMaster.departmentId },
      })
      departmentName = department?.departmentName || ''
    }

    if (updated.employeeMaster.designationId) {
      const designation = await this.prisma.designation.findUnique({
        where: { id: updated.employeeMaster.designationId },
      })
      designationName = designation?.designationName || ''
    }

    // Fetch user name if uploadedBy exists
    const userMap = new Map<string, string>()
    if (updated.uploadedBy) {
      const user = await this.prisma.user.findUnique({
        where: { id: updated.uploadedBy },
        select: { id: true, name: true },
      })
      if (user) {
        userMap.set(user.id, user.name)
      }
    }

    return this.formatDocumentResponse(updated, departmentName, designationName, userMap)
  }

  async activate(id: string) {
    const document = await this.prisma.employeeDocument.findUnique({
      where: { id },
    })

    if (!document) {
      throw new NotFoundException('Document not found')
    }

    const updated = await this.prisma.employeeDocument.update({
      where: { id },
      data: { status: 'ACTIVE' },
      include: {
        employeeMaster: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    })

    // Get department and designation names
    let departmentName = ''
    let designationName = ''

    if (updated.employeeMaster.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: updated.employeeMaster.departmentId },
      })
      departmentName = department?.departmentName || ''
    }

    if (updated.employeeMaster.designationId) {
      const designation = await this.prisma.designation.findUnique({
        where: { id: updated.employeeMaster.designationId },
      })
      designationName = designation?.designationName || ''
    }

    // Fetch user name if uploadedBy exists
    const userMap = new Map<string, string>()
    if (updated.uploadedBy) {
      const user = await this.prisma.user.findUnique({
        where: { id: updated.uploadedBy },
        select: { id: true, name: true },
      })
      if (user) {
        userMap.set(user.id, user.name)
      }
    }

    return this.formatDocumentResponse(updated, departmentName, designationName, userMap)
  }

  async remove(id: string) {
    const document = await this.prisma.employeeDocument.findUnique({
      where: { id },
    })

    if (!document) {
      throw new NotFoundException('Document not found')
    }

    await this.prisma.employeeDocument.delete({
      where: { id },
    })
  }

  private formatDocumentResponse(
    doc: any,
    departmentName: string,
    designationName: string,
    userMap?: Map<string, string>,
  ) {
    // Get uploaded by name if available
    let uploadedByName = 'System'
    if (doc.uploadedBy) {
      if (userMap && userMap.has(doc.uploadedBy)) {
        uploadedByName = userMap.get(doc.uploadedBy) || 'System'
      } else {
        // Fallback to ID if user not found (shouldn't happen, but safe fallback)
        uploadedByName = doc.uploadedBy
      }
    }

    return {
      id: doc.id,
      employeeId: doc.employeeMasterId,
      employeeCode: doc.employeeMaster.employeeCode,
      employeeName: `${doc.employeeMaster.firstName} ${doc.employeeMaster.lastName}`,
      departmentName,
      designationName,
      documentName: doc.documentName,
      documentType: doc.documentType,
      documentCategory: doc.documentCategory,
      fileSize: doc.fileSize,
      uploadDate: doc.uploadDate.toISOString().split('T')[0],
      expiryDate: doc.expiryDate ? doc.expiryDate.toISOString().split('T')[0] : null,
      uploadedBy: uploadedByName,
      status:
        doc.status === 'ACTIVE' ? 'Active' : doc.status === 'ARCHIVED' ? 'Archived' : 'Expired',
      description: doc.description,
      fileUrl: doc.fileUrl,
      version: doc.version,
      isConfidential: doc.isConfidential,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }
  }
}
