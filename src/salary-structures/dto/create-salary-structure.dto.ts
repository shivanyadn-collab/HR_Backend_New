import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  IsEnum,
  MinLength,
  Min,
} from 'class-validator'

export class CreateSalaryStructureDto {
  @IsString()
  @MinLength(1)
  employeeMasterId: string

  @IsString()
  @MinLength(1)
  employeeName: string

  @IsString()
  @MinLength(1)
  employeeCode: string

  @IsString()
  @MinLength(1)
  department: string

  @IsString()
  @MinLength(1)
  designation: string

  @IsNumber()
  @Min(0)
  basicSalary: number

  @IsNumber()
  @Min(0)
  hra: number

  @IsNumber()
  @Min(0)
  specialAllowance: number

  @IsNumber()
  @Min(0)
  transportAllowance: number

  @IsNumber()
  @Min(0)
  medicalAllowance: number

  @IsNumber()
  @Min(0)
  otherAllowances: number

  @IsNumber()
  @Min(0)
  providentFund: number

  @IsNumber()
  @Min(0)
  esic: number

  @IsNumber()
  @Min(0)
  professionalTax: number

  @IsNumber()
  @Min(0)
  tds: number

  @IsNumber()
  @Min(0)
  otherDeductions: number

  @IsDateString()
  effectiveDate: string

  @IsOptional()
  @IsString()
  templateId?: string
}
