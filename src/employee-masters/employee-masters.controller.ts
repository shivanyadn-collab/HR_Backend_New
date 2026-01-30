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
import { EmployeeMastersService } from './employee-masters.service'
import { CreateEmployeeMasterDto } from './dto/create-employee-master.dto'
import { UpdateEmployeeMasterDto } from './dto/update-employee-master.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { BucketService } from '../bucket/bucket.service'

@Controller('employee-masters')
@UseGuards(JwtAuthGuard)
export class EmployeeMastersController {
  constructor(
    private readonly employeeMastersService: EmployeeMastersService,
    private readonly bucketService: BucketService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createEmployeeMasterDto: CreateEmployeeMasterDto) {
    return this.employeeMastersService.create(createEmployeeMasterDto)
  }

  @Get()
  findAll(
    @Query('departmentId') departmentId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.employeeMastersService.findAll(departmentId, status, search)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.employeeMastersService.findOne(id)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateEmployeeMasterDto: UpdateEmployeeMasterDto) {
    return this.employeeMastersService.update(id, updateEmployeeMasterDto)
  }

  @Post(':id/upload-profile-photo')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
      fileFilter: (req, file, cb) => {
        // Check if file mimetype is allowed for profile photos
        if (['image/jpeg', 'image/jpg', 'image/png'].includes(file.mimetype)) {
          cb(null, true)
        } else {
          cb(
            new BadRequestException(
              'Invalid file type. Only JPEG and PNG images are allowed for profile photos.',
            ),
            false,
          )
        }
      },
    }),
  )
  async uploadProfilePhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Profile photo file is required')
    }

    try {
      // Generate unique filename for profile photos
      const customFileName = `profile-${id}-${Date.now()}.jpg`

      // Upload profile photo to S3 bucket
      const uploadResult = await this.bucketService.uploadFile(file, 'profile-photos', customFileName)

      // Update employee master with profile photo URL
      return this.employeeMastersService.updateProfilePhoto(id, uploadResult.url)
    } catch (error) {
      throw new BadRequestException(`Failed to upload profile photo: ${error.message}`)
    }
  }

  @Delete(':id/profile-photo')
  async removeProfilePhoto(@Param('id') id: string) {
    return this.employeeMastersService.removeProfilePhoto(id)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.employeeMastersService.remove(id)
  }
}
