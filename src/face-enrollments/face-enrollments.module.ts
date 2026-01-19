import { Module } from '@nestjs/common'
import { FaceEnrollmentsService } from './face-enrollments.service'
import { FaceEnrollmentsController } from './face-enrollments.controller'
import { PrismaModule } from '../prisma/prisma.module'
import { BucketModule } from '../bucket/bucket.module'

@Module({
  imports: [PrismaModule, BucketModule],
  controllers: [FaceEnrollmentsController],
  providers: [FaceEnrollmentsService],
  exports: [FaceEnrollmentsService],
})
export class FaceEnrollmentsModule {}
