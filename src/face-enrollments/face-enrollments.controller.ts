import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, UseInterceptors, UploadedFile, ParseFilePipe, MaxFileSizeValidator, BadRequestException } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { FaceEnrollmentsService } from './face-enrollments.service'
import { CreateFaceEnrollmentDto } from './dto/create-face-enrollment.dto'
import { UpdateFaceEnrollmentDto } from './dto/update-face-enrollment.dto'
import { UploadFaceImageDto } from './dto/upload-face-image.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { diskStorage } from 'multer'
import { extname, join } from 'path'
import { existsSync, mkdirSync } from 'fs'

// Allowed image MIME types
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

@Controller('face-enrollments')
@UseGuards(JwtAuthGuard)
export class FaceEnrollmentsController {
  constructor(private readonly service: FaceEnrollmentsService) {}

  @Post()
  create(@Body() createDto: CreateFaceEnrollmentDto) {
    return this.service.create(createDto)
  }

  @Get()
  findAll(
    @Query('employeeMasterId') employeeMasterId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.service.findAll(employeeMasterId, status, search)
  }

  @Get('employee/:employeeMasterId')
  async findByEmployeeId(@Param('employeeMasterId') employeeMasterId: string) {
    const enrollment = await this.service.findByEmployeeId(employeeMasterId)
    if (!enrollment) {
      return null
    }
    return enrollment
  }

  @Get(':id/images')
  getImages(@Param('id') id: string) {
    return this.service.getImages(id)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateFaceEnrollmentDto) {
    return this.service.update(id, updateDto)
  }

  @Post(':id/upload-image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = join(process.cwd(), 'uploads', 'face-images')
          if (!existsSync(uploadPath)) {
            mkdirSync(uploadPath, { recursive: true })
          }
          cb(null, uploadPath)
        },
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`)
        },
      }),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
      fileFilter: (req, file, cb) => {
        // Check if file mimetype is allowed
        if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
          cb(null, true)
        } else {
          cb(new BadRequestException(`Invalid file type. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}`), false)
        }
      },
    }),
  )
  uploadImage(
    @Param('id') id: string,
    @UploadedFile()
    file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File is required')
    }
    
    const imageUrl = `/uploads/face-images/${file.filename}`
    const uploadDto: UploadFaceImageDto = {
      faceEnrollmentId: id,
      imageUrl,
      imageName: file.originalname,
      imageSize: file.size,
    }
    return this.service.uploadFaceImage(uploadDto)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id)
  }
}

