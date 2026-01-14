import { IsString, IsOptional, IsBoolean, IsArray, ValidateNested, IsNumber, IsEnum, MinLength, MaxLength, Matches, ArrayMinSize } from 'class-validator'
import { Type, Transform } from 'class-transformer'

class SalaryComponentDto {
  @IsString()
  @MinLength(1, { message: 'Component name cannot be empty' })
  @MaxLength(100, { message: 'Component name cannot exceed 100 characters' })
  name: string

  @IsEnum(['earning', 'deduction', 'contribution'])
  type: 'earning' | 'deduction' | 'contribution'

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Formula cannot exceed 500 characters' })
  formula?: string // Excel-like formula (e.g., "=CTC*0.3", "=Basic*0.5", "=5000", etc.)

  @IsOptional()
  @Transform(({ value }) => {
    // Allow any value type for flexibility - formulas will be evaluated
    return value
  })
  value?: any // Flexible value - can be number, string, or any value needed for formula

  @IsOptional()
  @IsEnum(['yes', 'no', 'partially'])
  isTaxable?: 'yes' | 'no' | 'partially'

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}

export class CreateSalaryTemplateDto {
  @IsString()
  @MinLength(1, { message: 'Template name cannot be empty' })
  @MaxLength(100, { message: 'Template name cannot exceed 100 characters' })
  templateName: string

  @IsString()
  @MinLength(1, { message: 'Template code cannot be empty' })
  @MaxLength(20, { message: 'Template code cannot exceed 20 characters' })
  @Matches(/^[A-Z0-9-_]+$/, { message: 'Template code can only contain uppercase letters, numbers, hyphens, and underscores' })
  templateCode: string

  @IsString()
  @MinLength(1, { message: 'Template type cannot be empty' })
  @MaxLength(50, { message: 'Template type cannot exceed 50 characters' })
  templateType: string

  @IsString()
  @MinLength(10, { message: 'Description must be at least 10 characters long' })
  @MaxLength(500, { message: 'Description cannot exceed 500 characters' })
  description: string

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one salary component is required' })
  @ValidateNested({ each: true })
  @Type(() => SalaryComponentDto)
  components: SalaryComponentDto[]

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}

