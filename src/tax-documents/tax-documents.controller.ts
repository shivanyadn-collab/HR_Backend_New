import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TaxDocumentsService } from './tax-documents.service';
import { CreateTaxDocumentDto } from './dto/create-tax-document.dto';
import { UpdateTaxDocumentDto } from './dto/update-tax-document.dto';

@Controller('tax-documents')
export class TaxDocumentsController {
  constructor(private readonly service: TaxDocumentsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @Body() createDto: CreateTaxDocumentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    // If file is uploaded, handle file storage here
    // For now, we'll just store the document metadata
    if (file) {
      // In a real implementation, you would upload the file to storage (S3, local, etc.)
      // and set the fileUrl
      createDto.fileUrl = `/uploads/tax-documents/${file.originalname}`;
    }
    return this.service.create(createDto);
  }

  @Get()
  findAll(
    @Query('employeeId') employeeId?: string,
    @Query('financialYear') financialYear?: string,
  ) {
    return this.service.findAll(employeeId, financialYear);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/download')
  getDownloadUrl(@Param('id') id: string) {
    return this.service.getDownloadUrl(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateTaxDocumentDto) {
    return this.service.update(id, updateDto);
  }

  @Patch(':id/verify')
  verify(
    @Param('id') id: string,
    @Body() body: { verifiedBy: string; remarks?: string },
  ) {
    return this.service.verify(id, body.verifiedBy, body.remarks);
  }

  @Patch(':id/reject')
  reject(
    @Param('id') id: string,
    @Body() body: { verifiedBy: string; remarks?: string },
  ) {
    return this.service.reject(id, body.verifiedBy, body.remarks);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
