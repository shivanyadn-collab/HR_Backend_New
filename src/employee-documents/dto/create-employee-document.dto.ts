import { IsString, IsDateString, IsOptional, IsEnum, IsBoolean, IsInt, IsIn } from 'class-validator'

export class CreateEmployeeDocumentDto {
  @IsString()
  employeeMasterId: string

  @IsString()
  documentName: string

  @IsString()
  documentType: string

  @IsString()
  documentCategory: string

  @IsInt()
  fileSize: number

  /** S3/HTTP URL, or base64 data URL (data:...;base64,...). Base64 is auto-uploaded to S3 and stored as URL. Prefer POST /upload for file uploads. */
  @IsOptional()
  @IsString()
  fileUrl?: string

  @IsOptional()
  @IsString()
  fileKey?: string

  @IsOptional()
  @IsDateString()
  uploadDate?: string

  @IsOptional()
  @IsDateString()
  expiryDate?: string

  @IsOptional()
  @IsString()
  uploadedBy?: string

  @IsOptional()
  @IsIn(['ACTIVE', 'ARCHIVED', 'EXPIRED'])
  status?: 'ACTIVE' | 'ARCHIVED' | 'EXPIRED'

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsString()
  version?: string

  @IsOptional()
  @IsBoolean()
  isConfidential?: boolean
}
