import { Module } from '@nestjs/common';
import { InvestmentDeclarationsService } from './investment-declarations.service';
import { InvestmentDeclarationsController } from './investment-declarations.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [InvestmentDeclarationsController],
  providers: [InvestmentDeclarationsService],
  exports: [InvestmentDeclarationsService],
})
export class InvestmentDeclarationsModule {}
