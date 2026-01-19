import { PartialType } from '@nestjs/mapped-types'
import { CreateShiftChangeRequestDto } from './create-shift-change-request.dto'
import { IsString, IsOptional, IsEnum } from 'class-validator'

export enum ShiftChangeRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export class UpdateShiftChangeRequestDto extends PartialType(CreateShiftChangeRequestDto) {
  @IsOptional()
  @IsEnum(ShiftChangeRequestStatus)
  status?: ShiftChangeRequestStatus

  @IsOptional()
  @IsString()
  rejectionReason?: string

  @IsOptional()
  @IsString()
  approvedBy?: string
}
