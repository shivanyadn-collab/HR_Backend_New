import { IsString, IsOptional, IsBoolean, IsArray, IsNumber, Min, Max } from 'class-validator'

export class VerifyFaceDto {
  @IsString()
  employeeMasterId: string

  @IsString()
  selfieImageUrl: string

  @IsString()
  profilePhotoUrl: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enrolledFaceImages?: string[] // Array of enrolled face image URLs for better matching

  @IsOptional()
  @IsBoolean()
  checkAntiSpoofing?: boolean

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  antiSpoofingMethods?: string[]

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minConfidence?: number

  @IsOptional()
  @IsBoolean()
  requireLiveness?: boolean
}
