import { IsString, IsInt, IsNumber, IsOptional, Min } from 'class-validator'

export class UpdateLeaveBalanceDto {
  @IsOptional()
  @IsString()
  employeeMasterId?: string

  @IsOptional()
  @IsString()
  leavePolicyId?: string

  @IsOptional()
  @IsInt()
  @Min(2000)
  year?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalAllocated?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  used?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  carryForward?: number
}

