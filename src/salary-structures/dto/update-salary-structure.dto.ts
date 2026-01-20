import { PartialType } from '@nestjs/mapped-types'
import { CreateSalaryStructureDto } from './create-salary-structure.dto'
import { IsOptional, IsEnum } from 'class-validator'

export class UpdateSalaryStructureDto extends PartialType(CreateSalaryStructureDto) {
  @IsOptional()
  @IsEnum(['Active', 'Inactive'])
  status?: 'Active' | 'Inactive'
}
