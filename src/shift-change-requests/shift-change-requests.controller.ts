import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ShiftChangeRequestsService } from './shift-change-requests.service'
import { CreateShiftChangeRequestDto } from './dto/create-shift-change-request.dto'
import { UpdateShiftChangeRequestDto } from './dto/update-shift-change-request.dto'

@Controller('shift-change-requests')
@UseGuards(JwtAuthGuard)
export class ShiftChangeRequestsController {
  constructor(private readonly shiftChangeRequestsService: ShiftChangeRequestsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createDto: CreateShiftChangeRequestDto) {
    return this.shiftChangeRequestsService.create(createDto)
  }

  @Get()
  findAll(
    @Query('employeeMasterId') employeeMasterId?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.shiftChangeRequestsService.findAll(employeeMasterId, status, startDate, endDate)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.shiftChangeRequestsService.findOne(id)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateShiftChangeRequestDto) {
    return this.shiftChangeRequestsService.update(id, updateDto)
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string, @Body() body?: { approvedBy?: string }) {
    return this.shiftChangeRequestsService.update(id, {
      status: 'APPROVED' as any,
      approvedBy: body?.approvedBy,
    })
  }

  @Patch(':id/reject')
  reject(@Param('id') id: string, @Body() body: { rejectionReason?: string }) {
    return this.shiftChangeRequestsService.update(id, {
      status: 'REJECTED' as any,
      rejectionReason: body.rejectionReason,
    })
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @Body() body?: { reason?: string }) {
    return this.shiftChangeRequestsService.cancel(id, body?.reason)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.shiftChangeRequestsService.remove(id)
  }
}
