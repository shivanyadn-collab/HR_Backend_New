import { IsString, IsNumber, IsEnum, IsOptional, Min, Max } from 'class-validator'
import { GPSPunchType, GPSPunchStatus } from './create-gps-punch.dto'

export class UpdateGPSPunchDto {
  @IsOptional()
  @IsString()
  employeeMasterId?: string

  @IsOptional()
  @IsString()
  projectId?: string

  @IsOptional()
  @IsString()
  geofenceAreaId?: string

  @IsOptional()
  @IsEnum(GPSPunchType)
  punchType?: GPSPunchType

  @IsOptional()
  punchTime?: string

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number

  @IsOptional()
  @IsString()
  location?: string

  @IsOptional()
  @IsNumber()
  distance?: number

  @IsOptional()
  @IsEnum(GPSPunchStatus)
  status?: GPSPunchStatus

  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracy?: number

  @IsOptional()
  @IsString()
  selfieImageUrl?: string

  @IsOptional()
  @IsString()
  remarks?: string
}
