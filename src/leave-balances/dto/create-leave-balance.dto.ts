import { IsString, IsInt, IsNumber, IsOptional, Min } from 'class-validator'

export class CreateLeaveBalanceDto {
  @IsString()
  employeeMasterId: string

  @IsString()
  leavePolicyId: string

  @IsInt()
  @Min(2000)
  year: number

  @IsNumber()
  @Min(0)
  totalAllocated: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  used?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  carryForward?: number
}
