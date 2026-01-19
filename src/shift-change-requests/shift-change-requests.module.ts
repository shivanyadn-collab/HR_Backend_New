import { Module } from '@nestjs/common'
import { ShiftChangeRequestsService } from './shift-change-requests.service'
import { ShiftChangeRequestsController } from './shift-change-requests.controller'
import { PrismaService } from '../prisma/prisma.service'

@Module({
  controllers: [ShiftChangeRequestsController],
  providers: [ShiftChangeRequestsService, PrismaService],
  exports: [ShiftChangeRequestsService],
})
export class ShiftChangeRequestsModule {}
