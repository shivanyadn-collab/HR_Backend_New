import { Controller, Get, Post, Body, Patch, Delete, UseGuards, HttpCode, HttpStatus, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CompanyService } from './company.service'
import { CreateCompanyDto } from './dto/create-company.dto'
import { UpdateCompanyDto } from './dto/update-company.dto'
import { BucketService } from '../bucket/bucket.service'

@Controller('company')
@UseGuards(JwtAuthGuard)
export class CompanyController {
  constructor(
    private readonly companyService: CompanyService,
    private readonly bucketService: BucketService,
  ) {}

  @Get('profile')
  getProfile() {
    return this.companyService.findOne()
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createCompanyDto: CreateCompanyDto) {
    return this.companyService.create(createCompanyDto)
  }

  @Post('upload-logo')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
      fileFilter: (req, file, cb) => {
        // Check if file mimetype is allowed for logos
        if (['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file.mimetype)) {
          cb(null, true)
        } else {
          cb(
            new BadRequestException(
              'Invalid file type. Only image files (JPEG, PNG, WebP, SVG) are allowed for company logos.',
            ),
            false,
          )
        }
      },
    }),
  )
  async uploadLogo(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Logo file is required')
    }

    try {
      // Generate unique filename for company logos
      const customFileName = `company-logo-${Date.now()}.jpg`

      // Upload logo to S3 bucket
      const uploadResult = await this.bucketService.uploadFile(file, 'company-logos', customFileName)

      // Update company with logo URL
      return this.companyService.updateLogo(uploadResult.url)
    } catch (error) {
      throw new BadRequestException(`Failed to upload company logo: ${error.message}`)
    }
  }

  @Delete('logo')
  async removeLogo() {
    return this.companyService.removeLogo()
  }

  @Patch('profile')
  updateProfile(@Body() updateCompanyDto: UpdateCompanyDto) {
    return this.companyService.updateProfile(updateCompanyDto)
  }
}
