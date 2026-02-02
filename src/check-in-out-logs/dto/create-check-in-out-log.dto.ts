import { IsString, IsDateString, IsOptional, IsNumber, IsEnum } from 'class-validator'

export enum CheckInMethod {
  BIOMETRIC = 'BIOMETRIC',
  RFID = 'RFID',
  MOBILE_APP = 'MOBILE_APP',
  MANUAL = 'MANUAL',
}

export enum CheckInOutStatus {
  CHECKED_IN = 'CHECKED_IN',
  CHECKED_OUT = 'CHECKED_OUT',
  INCOMPLETE = 'INCOMPLETE',
}

export class CreateCheckInOutLogDto {
  @IsString()
  employeeMasterId: string

  /** When provided, server computes logDate and checkInTime in IST from this UTC ISO. Overrides client logDate/checkInTime. */
  @IsOptional()
  @IsString()
  checkInPunchDateTime?: string

  /** When provided, server computes checkOutTime (and logDate if not set) in IST from this UTC ISO. Overrides client checkOutTime. */
  @IsOptional()
  @IsString()
  checkOutPunchDateTime?: string

  /** IST date (YYYY-MM-DD). Ignored if checkInPunchDateTime or checkOutPunchDateTime is provided. */
  @IsOptional()
  @IsDateString()
  logDate?: string

  @IsOptional()
  @IsString()
  checkInTime?: string

  @IsOptional()
  @IsString()
  checkOutTime?: string

  @IsOptional()
  @IsString()
  checkInLocation?: string

  @IsOptional()
  @IsString()
  checkOutLocation?: string

  @IsEnum(CheckInMethod)
  checkInMethod: CheckInMethod

  @IsOptional()
  @IsEnum(CheckInMethod)
  checkOutMethod?: CheckInMethod

  @IsOptional()
  @IsNumber()
  workingHours?: number

  @IsOptional()
  @IsEnum(CheckInOutStatus)
  status?: CheckInOutStatus
}
