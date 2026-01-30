import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common'
import { InvestmentDeclarationsService } from './investment-declarations.service'
import { CreateInvestmentDeclarationDto } from './dto/create-investment-declaration.dto'
import { UpdateInvestmentDeclarationDto } from './dto/update-investment-declaration.dto'

@Controller('investment-declarations')
export class InvestmentDeclarationsController {
  constructor(private readonly service: InvestmentDeclarationsService) {}

  @Post()
  create(@Body() createDto: CreateInvestmentDeclarationDto) {
    return this.service.create(createDto)
  }

  @Get()
  findAll(
    @Query('employeeId') employeeId?: string,
    @Query('financialYear') financialYear?: string,
  ) {
    return this.service.findAll(employeeId, financialYear)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateInvestmentDeclarationDto) {
    return this.service.update(id, updateDto)
  }

  @Patch(':id/verify')
  verify(
    @Param('id') id: string,
    @Body() body: { verifiedBy: string; verifiedAmount: number; remarks?: string },
  ) {
    return this.service.verify(id, body.verifiedBy, body.verifiedAmount, body.remarks)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id)
  }
}
