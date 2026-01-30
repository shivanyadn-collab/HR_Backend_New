import { IsString, IsDateString, IsOptional, IsEnum, IsNumber } from 'class-validator'

export enum LeaveSession {
  FULL_DAY = 'FULL_DAY',
  FIRST_HALF = 'FIRST_HALF',
  SECOND_HALF = 'SECOND_HALF',
}

export class CreateLeaveApplicationDto {
  @IsString()
  employeeMasterId: string

  @IsString()
  leavePolicyId: string

  @IsDateString()
  startDate: string

  @IsDateString()
  endDate: string

  @IsOptional()
  @IsEnum(LeaveSession)
  leaveSession?: LeaveSession

  @IsString()
  reason: string

  @IsOptional()
  @IsString()
  attachmentUrl?: string

  @IsOptional()
  @IsString()
  attachmentName?: string
}
