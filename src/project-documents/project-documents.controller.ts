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
  ParseFilePipe,
  MaxFileSizeValidator,
  BadRequestException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ProjectDocumentsService } from './project-documents.service'
import { CreateProjectDocumentDto } from './dto/create-project-document.dto'
import { UpdateProjectDocumentDto } from './dto/update-project-document.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { BucketService } from '../bucket/bucket.service'
import { extname } from 'path'

@Controller('project-documents')
@UseGuards(JwtAuthGuard)
export class ProjectDocumentsController {
  constructor(
    private readonly projectDocumentsService: ProjectDocumentsService,
    private readonly bucketService: BucketService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
      },
    }),
  )
  async create(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 }), // 50MB
        ],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
    @Body() body: any,
  ) {
    // Parse FormData values - all FormData values come as strings
    // Validate required fields
    if (!body.projectId) {
      throw new BadRequestException('projectId must be a string')
    }
    if (!body.category) {
      throw new BadRequestException('category must be a string')
    }

    try {
      // Upload file to bucket
      const uploadResult = await this.bucketService.uploadFile(file, 'project-documents')

    const createProjectDocumentDto: CreateProjectDocumentDto = {
      projectId: String(body.projectId),
      fileName: String(body.fileName || file.originalname),
      fileType: String(body.fileType || extname(file.originalname).slice(1) || 'unknown'),
        fileSize: Number(file.size),
        fileUrl: uploadResult.url,
        fileKey: uploadResult.key, // Store the bucket key for future operations
      category: String(body.category),
      description: body.description ? String(body.description) : undefined,
      version: body.version ? String(body.version) : undefined,
      uploadedBy: body.uploadedBy ? String(body.uploadedBy) : undefined,
      isActive: body.isActive === 'true' || body.isActive === true || body.isActive === undefined,
    }
    return this.projectDocumentsService.create(createProjectDocumentDto)
    } catch (error) {
      throw new BadRequestException(`Failed to upload file: ${error.message}`)
    }
  }

  @Get()
  findAll(
    @Query('projectId') projectId?: string,
    @Query('category') category?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.projectDocumentsService.findAll(
      projectId,
      category,
      isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    )
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectDocumentsService.findOne(id)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateProjectDocumentDto: UpdateProjectDocumentDto) {
    return this.projectDocumentsService.update(id, updateProjectDocumentDto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.projectDocumentsService.remove(id)
  }
}
