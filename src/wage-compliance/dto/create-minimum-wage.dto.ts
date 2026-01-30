import { IsString, IsNumber, IsOptional, IsBoolean, IsDateString, Min } from 'class-validator'

export class CreateMinimumWageDto {
  @IsString()
  state: string

  @IsString()
  category: string // 'Skilled', 'Semi-Skilled', 'Unskilled'

  @IsNumber()
  @Min(0)
  minimumWage: number

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string

  @IsOptional()
  @IsDateString()
  effectiveTo?: string

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
