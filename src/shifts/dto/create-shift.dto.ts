import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsInt,
  IsArray,
  Min,
  Max,
} from 'class-validator'

export class CreateShiftDto {
  @IsString()
  shiftName: string

  @IsString()
  shiftCode: string

  @IsString()
  startTime: string // Format: HH:mm

  @IsString()
  endTime: string // Format: HH:mm

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(480)
  breakDuration?: number // in minutes

  @IsOptional()
  @IsNumber()
  totalHours?: number

  @IsOptional()
  @IsString()
  shiftType?: string // Shift type: '8hrs', '9hrs', '10hrs', '12hrs', 'Panama', etc.

  @IsOptional()
  @IsBoolean()
  isFlexible?: boolean

  @IsOptional()
  @IsInt()
  @Min(0)
  employeeCount?: number

  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @IsArray()
  @IsString({ each: true })
  workingDays: string[] // Array of day names

  @IsOptional()
  @IsString()
  weekOffPattern?: string // Complex weekly off pattern description: 'Sunday, 2nd & 4th Saturday'

  @IsOptional()
  @IsString()
  saturdayPattern?: string // 'ALL_OFF', 'ALL_WORKING', '2ND_4TH_OFF', '1ST_3RD_5TH_OFF', 'ALTERNATE'

  @IsOptional()
  @IsString()
  locationId?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  departmentIds?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  designationIds?: string[]
}
