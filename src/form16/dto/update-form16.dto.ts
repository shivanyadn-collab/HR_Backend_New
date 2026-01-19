import { PartialType } from '@nestjs/mapped-types'
import { CreateForm16Dto } from './create-form16.dto'

export class UpdateForm16Dto extends PartialType(CreateForm16Dto) {}
