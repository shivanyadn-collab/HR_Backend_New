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
import { GPSRouteStatus, CreateWaypointDto } from './create-gps-route-log.dto'

export class UpdateGPSRouteLogDto {
  @IsOptional()
  @IsString()
  employeeMasterId?: string

  @IsOptional()
  @IsString()
  projectId?: string

  @IsOptional()
  @IsDateString()
  date?: string

  @IsOptional()
  @IsDateString()
  startTime?: string

  @IsOptional()
  @IsDateString()
  endTime?: string

  @IsOptional()
  @IsString()
  startLocation?: string

  @IsOptional()
  @IsString()
  endLocation?: string

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  startLatitude?: number

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  startLongitude?: number

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
}

export class AddWaypointDto {
  @IsString()
  routeLogId: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateWaypointDto)
  waypoints: CreateWaypointDto[]
}
