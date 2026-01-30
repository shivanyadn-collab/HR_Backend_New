import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common'
import { GPSPunchesService } from './gps-punches.service'
import { CreateGPSPunchDto } from './dto/create-gps-punch.dto'
import { UpdateGPSPunchDto } from './dto/update-gps-punch.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'

@Controller('gps-punches')
@UseGuards(JwtAuthGuard)
export class GPSPunchesController {
  constructor(private readonly service: GPSPunchesService) {}

  @Post()
  create(@Body() createDto: CreateGPSPunchDto) {
    return this.service.create(createDto)
  }

  @Get()
  findAll(
    @Query('employeeMasterId') employeeMasterId?: string,
    @Query('punchType') punchType?: string,
    @Query('status') status?: string,
    @Query('projectId') projectId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
  ) {
    return this.service.findAll(
      employeeMasterId,
      punchType,
      status,
      projectId,
      startDate,
      endDate,
      search,
    )
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

  @Get('today')
  getTodayPunches(@Query('employeeMasterId') employeeMasterId?: string) {
    return this.service.getTodayPunches(employeeMasterId)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateGPSPunchDto) {
    return this.service.update(id, updateDto)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id)
  }
}
