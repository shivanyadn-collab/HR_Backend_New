import { Module, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import { PushNotificationsService } from './push-notifications.service'
import { PushNotificationsController } from './push-notifications.controller'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  controllers: [PushNotificationsController],
  providers: [PushNotificationsService],
  exports: [PushNotificationsService],
})
export class PushNotificationsModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushNotificationsModule.name)
  private schedulerInterval: NodeJS.Timeout | null = null

  constructor(private readonly pushNotificationsService: PushNotificationsService) {}

  onModuleInit() {
    // Start the scheduled notification processor (runs every minute)
    this.logger.log('Starting push notification scheduler...')
    this.schedulerInterval = this.pushNotificationsService.startScheduler(60000)
  }

  onModuleDestroy() {
    // Clean up the scheduler interval
    if (this.schedulerInterval) {
      this.logger.log('Stopping push notification scheduler...')
      clearInterval(this.schedulerInterval)
      this.schedulerInterval = null
    }
  }
}
