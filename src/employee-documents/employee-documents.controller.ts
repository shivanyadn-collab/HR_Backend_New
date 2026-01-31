import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { UserResponseDto } from '../auth/dto/auth-response.dto'
import { EmployeeDocumentsService } from './employee-documents.service'
import { CreateEmployeeDocumentDto } from './dto/create-employee-document.dto'
import { UpdateEmployeeDocumentDto } from './dto/update-employee-document.dto'
import { BucketService } from '../bucket/bucket.service'

@Controller('employee-documents')
@UseGuards(JwtAuthGuard)
export class EmployeeDocumentsController {
  constructor(
    private readonly employeeDocumentsService: EmployeeDocumentsService,
    private readonly bucketService: BucketService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() createEmployeeDocumentDto: CreateEmployeeDocumentDto,
    @CurrentUser() user: UserResponseDto,
  ) {
    // Set uploadedBy if not provided
    if (!createEmployeeDocumentDto.uploadedBy) {
      createEmployeeDocumentDto.uploadedBy = user.id
    }
    return this.employeeDocumentsService.create(createEmployeeDocumentDto)
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  async uploadDocument(
    @Body() createDto: Omit<CreateEmployeeDocumentDto, 'fileUrl' | 'fileKey' | 'fileSize' | 'uploadDate'>,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: UserResponseDto,
  ) {
    if (!file) {
      throw new BadRequestException('File is required')
    }

    try {
      // Upload file to S3 bucket
      const uploadResult = await this.bucketService.uploadFile(file, 'employee-documents')

      const completeDto: CreateEmployeeDocumentDto = {
        ...createDto,
        fileUrl: uploadResult.url,
        fileKey: uploadResult.key,
        fileSize: file.size,
        uploadedBy: user.id,
        uploadDate: new Date().toISOString(),
      }

      return this.employeeDocumentsService.create(completeDto)
    } catch (error) {
      throw new BadRequestException(`Failed to upload employee document: ${error.message}`)
    }
  }

  @Get()
  findAll(
    @Query('employeeMasterId') employeeMasterId?: string,
    @Query('documentCategory') documentCategory?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.employeeDocumentsService.findAll(employeeMasterId, documentCategory, status, search)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.employeeDocumentsService.findOne(id)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateEmployeeDocumentDto: UpdateEmployeeDocumentDto) {
    return this.employeeDocumentsService.update(id, updateEmployeeDocumentDto)
  }

  @Patch(':id/archive')
  archive(@Param('id') id: string) {
    return this.employeeDocumentsService.archive(id)
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string) {
    return this.employeeDocumentsService.activate(id)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.employeeDocumentsService.remove(id)
  }
}
