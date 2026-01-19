import { Module } from '@nestjs/common'
import { EmployeeMastersService } from './employee-masters.service'
import { EmployeeMastersController } from './employee-masters.controller'
import { PrismaModule } from '../prisma/prisma.module'
import { BucketModule } from '../bucket/bucket.module'

@Module({
  imports: [PrismaModule, BucketModule],
  controllers: [EmployeeMastersController],
  providers: [EmployeeMastersService],
  exports: [EmployeeMastersService],
})
export class EmployeeMastersModule {}
