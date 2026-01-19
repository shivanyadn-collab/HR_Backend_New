import { Module } from '@nestjs/common'
import { TaxDocumentsService } from './tax-documents.service'
import { TaxDocumentsController } from './tax-documents.controller'
import { PrismaModule } from '../prisma/prisma.module'
import { BucketModule } from '../bucket/bucket.module'

@Module({
  imports: [PrismaModule, BucketModule],
  controllers: [TaxDocumentsController],
  providers: [TaxDocumentsService],
  exports: [TaxDocumentsService],
})
export class TaxDocumentsModule {}
