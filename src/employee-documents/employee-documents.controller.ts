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
  NotFoundException,
  Redirect,
  Req,
  StreamableFile,
} from '@nestjs/common'
import { Request } from 'express'
import { extname } from 'path'
import { FileInterceptor } from '@nestjs/platform-express'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { UserResponseDto } from '../auth/dto/auth-response.dto'
import { EmployeeDocumentsService } from './employee-documents.service'
import { CreateEmployeeDocumentDto } from './dto/create-employee-document.dto'
import { UpdateEmployeeDocumentDto } from './dto/update-employee-document.dto'
import { BucketService, BucketProvider } from '../bucket/bucket.service'

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

  /** Stream file (200 + body). Frontend can fetch as blob and trigger same-page download. */
  @Get(':id/download/stream')
  async downloadStream(@Param('id') id: string) {
    const { fileUrl, fileKey, documentName } = await this.employeeDocumentsService.getFileUrl(id)
    const bucketConfig = this.bucketService.getConfig()

    let key: string
    if (fileKey) {
      key = fileKey
    } else if (bucketConfig.provider === BucketProvider.AWS_S3) {
      throw new BadRequestException('Document has no file key; cannot stream')
    } else {
      // Local: fileUrl is like /uploads/employee-documents/...
      key = (fileUrl || '').replace(/^\/uploads\/?/, '')
    }

    if (!key) {
      throw new NotFoundException('Document file path could not be resolved')
    }

    const { stream, contentType } = await this.bucketService.getFileStream(key)
    const ext = key ? extname(key) || '.bin' : '.bin'
    const safeName = (documentName || 'document').replace(/[^\w\s.-]/g, '_').trim() || 'document'
    const filename = `${safeName}${ext}`

    return new StreamableFile(stream, {
      type: contentType || 'application/octet-stream',
      disposition: `attachment; filename="${filename}"`,
    })
  }

  /** Redirect to document file (presigned S3 URL or /uploads/). Content-Disposition: attachment so browser downloads. */
  @Get(':id/download')
  @Redirect()
  async download(@Param('id') id: string, @Req() req: Request) {
    const { fileUrl, fileKey, documentName } = await this.employeeDocumentsService.getFileUrl(id)
    const bucketConfig = this.bucketService.getConfig()

    // Resolve S3 key: use stored fileKey, or derive from fileUrl for older records
    let s3Key: string | null = fileKey
    if (!s3Key && bucketConfig.provider === BucketProvider.AWS_S3 && fileUrl.startsWith('http')) {
      try {
        const s3Host = `https://${bucketConfig.bucketName}.s3.${bucketConfig.region}.amazonaws.com`
        if (fileUrl.startsWith(s3Host + '/') || fileUrl === s3Host) {
          s3Key = new URL(fileUrl).pathname.replace(/^\//, '') || null
        }
      } catch {
        s3Key = null
      }
    }

    const ext = s3Key ? extname(s3Key) || '.pdf' : '.pdf'
    const safeName = (documentName || 'document').replace(/[^\w\s.-]/g, '_').trim() || 'document'
    const filename = `${safeName}${ext}`
    const responseContentDisposition = `attachment; filename="${filename}"`

    // For S3, use a presigned URL with Content-Disposition so browser saves the file
    if (s3Key && bucketConfig.provider === BucketProvider.AWS_S3) {
      const signedUrl = await this.bucketService.getSignedUrl(s3Key, 3600, {
        responseContentDisposition,
      })
      return { url: signedUrl, statusCode: 302 }
    }

    // If relative (e.g. /uploads/...), build absolute URL from request origin
    const redirectUrl =
      fileUrl.startsWith('http://') || fileUrl.startsWith('https://')
        ? fileUrl
        : `${req.protocol}://${req.get('host')}${fileUrl}`
    return { url: redirectUrl, statusCode: 302 }
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
