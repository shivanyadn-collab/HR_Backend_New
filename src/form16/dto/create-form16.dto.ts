import { IsString, IsBoolean, IsOptional, IsDateString } from 'class-validator'

export class CreateForm16Dto {
  @IsString()
  employeeMasterId: string

  @IsString()
  financialYear: string

  @IsBoolean()
  @IsOptional()
  partA?: boolean

  @IsBoolean()
  @IsOptional()
  partB?: boolean

  @IsDateString()
  @IsOptional()
  generatedDate?: string

  @IsString()
  @IsOptional()
  downloadUrl?: string

  @IsString()
  @IsOptional()
  fileName?: string

  @IsString()
  @IsOptional()
  status?: string

  @IsString()
  @IsOptional()
  remarks?: string
}
