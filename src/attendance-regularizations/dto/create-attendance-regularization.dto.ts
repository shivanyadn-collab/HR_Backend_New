import { IsString, IsDateString, IsOptional, IsEnum } from 'class-validator'

export enum RegularizationType {
  MISSED_PUNCH = 'MISSED_PUNCH',
  ON_DUTY = 'ON_DUTY',
  WORK_FROM_HOME = 'WORK_FROM_HOME',
  OUTDOOR_DUTY = 'OUTDOOR_DUTY',
  CLIENT_VISIT = 'CLIENT_VISIT',
  HALF_DAY_CORRECTION = 'HALF_DAY_CORRECTION',
}

export class CreateAttendanceRegularizationDto {
  @IsString()
  employeeMasterId: string

  @IsOptional()
  @IsEnum(RegularizationType)
  regularizationType?: RegularizationType

  @IsDateString()
  date: string

  @IsOptional()
  @IsString()
  originalCheckIn?: string

  @IsOptional()
  @IsString()
  originalCheckOut?: string

  @IsOptional()
  @IsString()
  requestedCheckIn?: string

  @IsOptional()
  @IsString()
  requestedCheckOut?: string

  @IsString()
  reason: string

  @IsOptional()
  @IsString()
  location?: string

  @IsOptional()
  @IsString()
  supportingDocument?: string

  @IsOptional()
  @IsString()
  remarks?: string
}
