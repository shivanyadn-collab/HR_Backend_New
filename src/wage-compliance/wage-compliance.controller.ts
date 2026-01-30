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
  Request,
} from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WageComplianceService } from './wage-compliance.service'
import { CreateMinimumWageDto } from './dto/create-minimum-wage.dto'
import { UpdateMinimumWageDto } from './dto/update-minimum-wage.dto'

@Controller('wage-compliance')
@UseGuards(JwtAuthGuard)
export class WageComplianceController {
  constructor(private readonly wageComplianceService: WageComplianceService) {}

  @Get()
  findAll(
    @Query('status') status?: string,
    @Query('state') state?: string,
    @Query('month') month?: string,
    @Query('search') search?: string,
  ) {
    return this.wageComplianceService.findAll(status, state, month, search)
  }

  // Minimum Wage Configuration CRUD endpoints
  @Post('minimum-wage')
  createMinimumWage(@Body() createDto: CreateMinimumWageDto, @Request() req: any) {
    return this.wageComplianceService.createMinimumWage(
      createDto,
      req.user?.email || 'System',
    )
  }

  @Get('minimum-wage')
  findAllMinimumWages() {
    return this.wageComplianceService.findAllMinimumWages()
  }

  @Get('minimum-wage/states')
  getStates() {
    return this.wageComplianceService.getStates()
  }

  @Get('minimum-wage/categories')
  getCategories() {
    return this.wageComplianceService.getCategories()
  }

  @Get('minimum-wage/:id')
  findOneMinimumWage(@Param('id') id: string) {
    return this.wageComplianceService.findOneMinimumWage(id)
  }

  @Patch('minimum-wage/:id')
  updateMinimumWage(
    @Param('id') id: string,
    @Body() updateDto: UpdateMinimumWageDto,
    @Request() req: any,
  ) {
    return this.wageComplianceService.updateMinimumWage(
      id,
      updateDto,
      req.user?.email || 'System',
    )
  }

  @Delete('minimum-wage/:id')
  removeMinimumWage(@Param('id') id: string) {
    return this.wageComplianceService.removeMinimumWage(id)
  }
}
