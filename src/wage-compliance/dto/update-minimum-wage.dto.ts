import { PartialType } from '@nestjs/mapped-types'
import { CreateMinimumWageDto } from './create-minimum-wage.dto'

export class UpdateMinimumWageDto extends PartialType(CreateMinimumWageDto) {}
