import { IsString, IsDateString, IsOptional, IsNumber, IsEnum } from 'class-validator'

export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  LATE = 'LATE',
  HALF_DAY = 'HALF_DAY',
  ON_LEAVE = 'ON_LEAVE',
  HOLIDAY = 'HOLIDAY',
  WEEK_OFF = 'WEEK_OFF',
}

export class CreateDailyAttendanceDto {
  @IsString()
  employeeMasterId: string

  /** When provided, server computes date and checkIn in IST from this UTC ISO. Overrides client date/checkIn. */
  @IsOptional()
  @IsString()
  checkInPunchDateTime?: string

  /** When provided, server computes checkOut in IST from this UTC ISO. Overrides client checkOut. */
  @IsOptional()
  @IsString()
  checkOutPunchDateTime?: string

  /** IST date (YYYY-MM-DD). Ignored if checkInPunchDateTime or checkOutPunchDateTime is provided. */
  @IsOptional()
  @IsDateString()
  date?: string

  @IsOptional()
  @IsString()
  checkIn?: string

  @IsOptional()
  @IsString()
  checkOut?: string

  @IsOptional()
  @IsNumber()
  workingHours?: number

  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus

  @IsOptional()
  @IsString()
  location?: string

  @IsOptional()
  @IsString()
  remarks?: string
}
