import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { Form16Service } from './form16.service';
import { CreateForm16Dto } from './dto/create-form16.dto';
import { UpdateForm16Dto } from './dto/update-form16.dto';

@Controller('form16')
export class Form16Controller {
  constructor(private readonly form16Service: Form16Service) {}

  @Post()
  create(@Body() createForm16Dto: CreateForm16Dto) {
    return this.form16Service.create(createForm16Dto);
  }

  @Get()
  findAll(
    @Query('employeeId') employeeId?: string,
    @Query('financialYear') financialYear?: string,
  ) {
    return this.form16Service.findAll(employeeId, financialYear);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.form16Service.findOne(id);
  }

  @Get(':id/download')
  getDownloadUrl(@Param('id') id: string) {
    return this.form16Service.getDownloadUrl(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateForm16Dto: UpdateForm16Dto) {
    return this.form16Service.update(id, updateForm16Dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.form16Service.remove(id);
  }
}
