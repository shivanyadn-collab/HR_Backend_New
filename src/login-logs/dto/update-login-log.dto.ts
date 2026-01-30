import { PartialType } from '@nestjs/mapped-types'
import { CreateLoginLogDto } from './create-login-log.dto'
import { IsOptional, IsDateString } from 'class-validator'

export class UpdateLoginLogDto extends PartialType(CreateLoginLogDto) {
  @IsOptional()
  @IsDateString()
  logoutTime?: string
}
