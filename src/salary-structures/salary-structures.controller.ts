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
import { SalaryStructuresService } from './salary-structures.service'
import { CreateSalaryStructureDto } from './dto/create-salary-structure.dto'
import { UpdateSalaryStructureDto } from './dto/update-salary-structure.dto'

@Controller('salary-structures')
@UseGuards(JwtAuthGuard)
export class SalaryStructuresController {
  constructor(private readonly salaryStructuresService: SalaryStructuresService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createDto: CreateSalaryStructureDto) {
    return this.salaryStructuresService.create(createDto)
  }

  @Get()
  findAll(@Query('status') status?: string, @Query('search') search?: string) {
    return this.salaryStructuresService.findAll({ status, search })
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.salaryStructuresService.findOne(id)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateSalaryStructureDto) {
    return this.salaryStructuresService.update(id, updateDto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.salaryStructuresService.remove(id)
  }
}
