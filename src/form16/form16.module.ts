import { Module } from '@nestjs/common';
import { Form16Service } from './form16.service';
import { Form16Controller } from './form16.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [Form16Controller],
  providers: [Form16Service],
  exports: [Form16Service],
})
export class Form16Module {}
