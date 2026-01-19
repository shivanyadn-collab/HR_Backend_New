import { IsString, IsOptional, IsDateString } from 'class-validator'

export class CreateTaxDocumentDto {
  @IsString()
  employeeMasterId: string

  @IsString()
  documentType: string

  @IsString()
  documentName: string

  @IsString()
  financialYear: string

  @IsString()
  @IsOptional()
  fileUrl?: string

  @IsString()
  @IsOptional()
  fileKey?: string

  @IsDateString()
  @IsOptional()
  uploadDate?: string

  @IsString()
  @IsOptional()
  status?: string

  @IsString()
  @IsOptional()
  verifiedBy?: string

  @IsDateString()
  @IsOptional()
  verifiedDate?: string

  @IsString()
  @IsOptional()
  remarks?: string
}
