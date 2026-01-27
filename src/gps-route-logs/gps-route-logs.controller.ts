import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common'
import { GPSRouteLogsService } from './gps-route-logs.service'
import { CreateGPSRouteLogDto } from './dto/create-gps-route-log.dto'
import { UpdateGPSRouteLogDto, AddWaypointDto } from './dto/update-gps-route-log.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'

@Controller('gps-route-logs')
@UseGuards(JwtAuthGuard)
export class GPSRouteLogsController {
  constructor(private readonly service: GPSRouteLogsService) {}

  @Post()
  create(@Body() createDto: CreateGPSRouteLogDto) {
    return this.service.create(createDto)
  }

  @Get()
  findAll(
    @Query('employeeMasterId') employeeMasterId?: string,
    @Query('projectId') projectId?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
  ) {
    return this.service.findAll(employeeMasterId, projectId, status, startDate, endDate, search)
  }

  @Get('statistics')
  getStatistics(
    @Query('employeeMasterId') employeeMasterId?: string,
    @Query('projectId') projectId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.getStatistics(employeeMasterId, projectId, startDate, endDate)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateGPSRouteLogDto) {
    return this.service.update(id, updateDto)
  }

  @Patch(':id/complete')
  completeRoute(
    @Param('id') id: string,
    @Body() body: { endLocation?: string; endLatitude?: number; endLongitude?: number },
  ) {
    return this.service.completeRoute(id, body.endLocation, body.endLatitude, body.endLongitude)
  }

  @Post('waypoints')
  addWaypoints(@Body() addWaypointDto: AddWaypointDto) {
    return this.service.addWaypoints(addWaypointDto)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id)
  }
}
