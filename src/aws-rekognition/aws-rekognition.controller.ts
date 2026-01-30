import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Body,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { AwsRekognitionService } from './aws-rekognition.service'

@Controller('aws-rekognition')
@UseGuards(JwtAuthGuard)
export class AwsRekognitionController {
  constructor(private readonly rekognitionService: AwsRekognitionService) {}

  @Post('enroll')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
      fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png']
        if (allowed.includes(file.mimetype)) {
          cb(null, true)
        } else {
          cb(new BadRequestException('Only JPEG/PNG images allowed'), false)
        }
      },
    }),
  )
  async enroll(
    @UploadedFile() file: Express.Multer.File,
    @Body('employeeId') employeeId: string,
    @Body('employeeCode') employeeCode: string,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Image file is required')
    }
    if (!employeeId || !employeeCode) {
      throw new BadRequestException('employeeId and employeeCode are required')
    }

    const result = await this.rekognitionService.enrollFromBuffer(
      file.buffer,
      employeeId,
      employeeCode,
    )

    if (!result.success) {
      throw new BadRequestException(result.error || 'Failed to enroll face')
    }

    return {
      success: true,
      faceId: result.faceId,
      message: 'Face enrolled successfully',
    }
  }

  @Post('recognize')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png']
        if (allowed.includes(file.mimetype)) {
          cb(null, true)
        } else {
          cb(new BadRequestException('Only JPEG/PNG images allowed'), false)
        }
      },
    }),
  )
  async recognize(
    @UploadedFile() file: Express.Multer.File,
    @Body('cameraDeviceId') cameraDeviceId?: string,
    @Body('faceMatchThreshold') faceMatchThreshold?: number,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Image file is required')
    }

    const threshold = faceMatchThreshold ?? 80
    const result = await this.rekognitionService.recognizeFromBuffer(
      file.buffer,
      threshold,
    )

    if (!result.success) {
      throw new BadRequestException(result.error || 'Failed to recognize face')
    }

    return {
      success: true,
      matches: result.matches || [],
      cameraDeviceId: cameraDeviceId || null,
    }
  }

  @Delete('faces/:faceId')
  async deleteFace(@Param('faceId') faceId: string) {
    const result = await this.rekognitionService.deleteFace(faceId)
    if (!result.success) {
      throw new BadRequestException(result.error || 'Failed to delete face')
    }
    return { success: true, message: 'Face deleted successfully' }
  }

  @Get('faces')
  async listFaces() {
    const result = await this.rekognitionService.listFaces(100)
    if (!result.success) {
      throw new BadRequestException(result.error || 'Failed to list faces')
    }
    return {
      success: true,
      faces: result.faces || [],
    }
  }

  @Get('status')
  async status() {
    return {
      configured: this.rekognitionService.isEnabled(),
      message: this.rekognitionService.isEnabled()
        ? 'AWS Rekognition is configured'
        : 'AWS Rekognition credentials not set in backend .env',
    }
  }
}
