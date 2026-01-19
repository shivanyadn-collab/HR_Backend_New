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
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  BadRequestException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { FaceEnrollmentsService } from './face-enrollments.service'
import { CreateFaceEnrollmentDto } from './dto/create-face-enrollment.dto'
import { UpdateFaceEnrollmentDto } from './dto/update-face-enrollment.dto'
import { UploadFaceImageDto } from './dto/upload-face-image.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { BucketService } from '../bucket/bucket.service'

// Allowed image MIME types - Only JPEG for employee face images
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg']
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg']

@Controller('face-enrollments')
@UseGuards(JwtAuthGuard)
export class FaceEnrollmentsController {
  constructor(
    private readonly service: FaceEnrollmentsService,
    private readonly bucketService: BucketService,
  ) {}

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
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
      fileFilter: (req, file, cb) => {
        // Check if file mimetype is allowed
        if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
          cb(null, true)
        } else {
          cb(
            new BadRequestException(
              `Invalid file type. Only JPEG images (.jpg, .jpeg) are allowed for employee face images.`,
            ),
            false,
          )
        }
      },
    }),
  )
  async uploadImage(
    @Param('id') id: string,
    @UploadedFile()
    file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File is required')
    }
    
    try {
      // Generate unique filename with .jpg extension for face images
      const customFileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`

      // Upload image to bucket with .jpg extension
      const uploadResult = await this.bucketService.uploadFile(file, 'face-images', customFileName)

    const uploadDto: UploadFaceImageDto = {
      faceEnrollmentId: id,
        imageUrl: uploadResult.url,
        imageKey: uploadResult.key, // Store the bucket key
        imageName: customFileName, // Use the new .jpg filename
      imageSize: file.size,
    }
    return this.service.uploadFaceImage(uploadDto)
    } catch (error) {
      throw new BadRequestException(`Failed to upload image: ${error.message}`)
    }
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id)
  }
}
