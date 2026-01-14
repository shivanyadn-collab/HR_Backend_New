import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateForm16Dto } from './dto/create-form16.dto';
import { UpdateForm16Dto } from './dto/update-form16.dto';

@Injectable()
export class Form16Service {
  constructor(private prisma: PrismaService) {}

  async create(createForm16Dto: CreateForm16Dto) {
    const form16 = await this.prisma.form16.create({
      data: {
        employeeMasterId: createForm16Dto.employeeMasterId,
        financialYear: createForm16Dto.financialYear,
        partA: createForm16Dto.partA ?? false,
        partB: createForm16Dto.partB ?? false,
        generatedDate: createForm16Dto.generatedDate ? new Date(createForm16Dto.generatedDate) : null,
        downloadUrl: createForm16Dto.downloadUrl,
        fileName: createForm16Dto.fileName,
        status: (createForm16Dto.status as any) || 'PENDING',
        remarks: createForm16Dto.remarks,
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
    return this.formatResponse(form16);
  }

  async findAll(employeeId?: string, financialYear?: string) {
    const where: any = {};
    if (employeeId) where.employeeMasterId = employeeId;
    if (financialYear) where.financialYear = financialYear;

    const form16s = await this.prisma.form16.findMany({
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
      orderBy: { financialYear: 'desc' },
    });
    return form16s.map(this.formatResponse);
  }

  async findOne(id: string) {
    const form16 = await this.prisma.form16.findUnique({
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
    if (!form16) {
      throw new NotFoundException(`Form16 with ID ${id} not found`);
    }
    return this.formatResponse(form16);
  }

  async update(id: string, updateForm16Dto: UpdateForm16Dto) {
    await this.findOne(id);
    const form16 = await this.prisma.form16.update({
      where: { id },
      data: {
        ...updateForm16Dto,
        generatedDate: updateForm16Dto.generatedDate ? new Date(updateForm16Dto.generatedDate) : undefined,
        status: updateForm16Dto.status as any,
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
    return this.formatResponse(form16);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.form16.delete({ where: { id } });
    return { message: 'Form16 deleted successfully' };
  }

  async getDownloadUrl(id: string) {
    const form16 = await this.findOne(id);
    if (form16.downloadUrl) {
      return { fileUrl: form16.downloadUrl };
    }
    return { fileUrl: null, message: 'Form 16 not yet available for download' };
  }

  private formatResponse(form16: any) {
    return {
      id: form16.id,
      employeeMasterId: form16.employeeMasterId,
      employeeName: form16.employeeMaster 
        ? `${form16.employeeMaster.firstName} ${form16.employeeMaster.lastName}` 
        : null,
      employeeCode: form16.employeeMaster?.employeeCode,
      financialYear: form16.financialYear,
      partA: form16.partA,
      partB: form16.partB,
      generatedDate: form16.generatedDate?.toISOString().split('T')[0],
      downloadUrl: form16.downloadUrl,
      fileName: form16.fileName,
      status: form16.status,
      remarks: form16.remarks,
      createdAt: form16.createdAt,
      updatedAt: form16.updatedAt,
    };
  }
}
