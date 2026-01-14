import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaxDocumentDto } from './dto/create-tax-document.dto';
import { UpdateTaxDocumentDto } from './dto/update-tax-document.dto';

@Injectable()
export class TaxDocumentsService {
  constructor(private prisma: PrismaService) {}

  async create(createDto: CreateTaxDocumentDto) {
    const document = await this.prisma.taxDocument.create({
      data: {
        employeeMasterId: createDto.employeeMasterId,
        documentType: createDto.documentType,
        documentName: createDto.documentName,
        financialYear: createDto.financialYear,
        fileUrl: createDto.fileUrl,
        uploadDate: createDto.uploadDate ? new Date(createDto.uploadDate) : new Date(),
        status: (createDto.status as any) || 'PENDING',
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
    });
    return this.formatResponse(document);
  }

  async findAll(employeeId?: string, financialYear?: string) {
    const where: any = {};
    if (employeeId) where.employeeMasterId = employeeId;
    if (financialYear) where.financialYear = financialYear;

    const documents = await this.prisma.taxDocument.findMany({
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
      orderBy: { uploadDate: 'desc' },
    });
    return documents.map(this.formatResponse);
  }

  async findOne(id: string) {
    const document = await this.prisma.taxDocument.findUnique({
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
    });
    if (!document) {
      throw new NotFoundException(`Tax Document with ID ${id} not found`);
    }
    return this.formatResponse(document);
  }

  async update(id: string, updateDto: UpdateTaxDocumentDto) {
    await this.findOne(id);
    const document = await this.prisma.taxDocument.update({
      where: { id },
      data: {
        ...updateDto,
        uploadDate: updateDto.uploadDate ? new Date(updateDto.uploadDate) : undefined,
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
    });
    return this.formatResponse(document);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.taxDocument.delete({ where: { id } });
    return { message: 'Tax Document deleted successfully' };
  }

  async getDownloadUrl(id: string) {
    const document = await this.findOne(id);
    if (document.fileUrl) {
      return { fileUrl: document.fileUrl };
    }
    return { fileUrl: null, message: 'Document file not available' };
  }

  async verify(id: string, verifiedBy: string, remarks?: string) {
    await this.findOne(id);
    const document = await this.prisma.taxDocument.update({
      where: { id },
      data: {
        status: 'VERIFIED',
        verifiedBy,
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
    });
    return this.formatResponse(document);
  }

  async reject(id: string, verifiedBy: string, remarks?: string) {
    await this.findOne(id);
    const document = await this.prisma.taxDocument.update({
      where: { id },
      data: {
        status: 'REJECTED',
        verifiedBy,
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
    });
    return this.formatResponse(document);
  }

  private formatResponse(document: any) {
    return {
      id: document.id,
      employeeMasterId: document.employeeMasterId,
      employeeName: document.employeeMaster 
        ? `${document.employeeMaster.firstName} ${document.employeeMaster.lastName}` 
        : null,
      employeeCode: document.employeeMaster?.employeeCode,
      documentType: document.documentType,
      documentName: document.documentName,
      financialYear: document.financialYear,
      fileUrl: document.fileUrl,
      uploadDate: document.uploadDate?.toISOString().split('T')[0],
      status: document.status,
      verifiedBy: document.verifiedBy,
      verifiedDate: document.verifiedDate?.toISOString().split('T')[0],
      remarks: document.remarks,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }
}
