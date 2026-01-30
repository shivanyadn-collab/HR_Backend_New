import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsDateString,
  IsArray,
  ValidateNested,
  Min,
  Max,
} from 'class-validator'
import { Type } from 'class-transformer'

export enum GPSRouteStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  PAUSED = 'PAUSED',
}

export class CreateWaypointDto {
  @IsDateString()
  timestamp: string

  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number

  @IsString()
  location: string

  @IsOptional()
  @IsNumber()
  speed?: number
}

export class CreateGPSRouteLogDto {
  @IsString()
  employeeMasterId: string

  @IsOptional()
  @IsString()
  projectId?: string

  @IsDateString()
  date: string

  @IsDateString()
  startTime: string

  @IsOptional()
  @IsDateString()
  endTime?: string

  @IsString()
  startLocation: string

  @IsOptional()
  @IsString()
  endLocation?: string

  @IsNumber()
  @Min(-90)
  @Max(90)
  startLatitude: number

  @IsNumber()
  @Min(-180)
  @Max(180)
  startLongitude: number

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  endLatitude?: number

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  endLongitude?: number

  @IsOptional()
  @IsNumber()
  totalDistance?: number

  @IsOptional()
  @IsNumber()
  totalDuration?: number

  @IsOptional()
  @IsEnum(GPSRouteStatus)
  status?: GPSRouteStatus

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateWaypointDto)
  waypoints?: CreateWaypointDto[]
}
