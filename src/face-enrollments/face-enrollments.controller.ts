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
  StreamableFile,
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

  /**
   * Proxy S3 face images to avoid CORS when the frontend fetches them as blob/data URL.
   * Only allows URLs for the configured S3 bucket.
   */
  @Get('proxy-image')
  async proxyImage(@Query('url') url: string): Promise<StreamableFile> {
    if (!url || typeof url !== 'string') {
      throw new BadRequestException('Missing or invalid url parameter')
    }
    let decoded: string
    try {
      decoded = decodeURIComponent(url)
    } catch {
      throw new BadRequestException('Invalid url encoding')
    }
    const bucketName = this.bucketService.getConfig().bucketName
    if (!bucketName) {
      throw new BadRequestException('Bucket not configured')
    }
    // Allow only our S3 bucket URLs (e.g. https://bucket-name.s3.region.amazonaws.com/...)
    const allowedHost = `${bucketName}.s3.`
    if (!decoded.startsWith('https://') || !decoded.includes(allowedHost)) {
      throw new BadRequestException('URL must be a signed URL for the configured face image bucket')
    }
    const res = await fetch(decoded)
    if (!res.ok) {
      throw new BadRequestException(`Failed to fetch image: ${res.status}`)
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    const contentType = res.headers.get('content-type') || 'image/jpeg'
    return new StreamableFile(buffer, {
      type: contentType,
    })
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
