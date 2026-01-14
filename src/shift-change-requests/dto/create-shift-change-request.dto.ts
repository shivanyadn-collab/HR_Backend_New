import { IsString, IsDateString, IsOptional } from 'class-validator'

export class CreateShiftChangeRequestDto {
  @IsString()
  employeeMasterId: string

  @IsString()
  currentShiftId: string

  @IsString()
  requestedShiftId: string

  @IsDateString()
  effectiveDate: string

  @IsString()
  reason: string

  @IsOptional()
  @IsString()
  remarks?: string
}
