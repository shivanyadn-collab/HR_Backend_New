import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AwsRekognitionService } from './aws-rekognition.service'
import { AwsRekognitionController } from './aws-rekognition.controller'

@Module({
  imports: [ConfigModule],
  controllers: [AwsRekognitionController],
  providers: [AwsRekognitionService],
  exports: [AwsRekognitionService],
})
export class AwsRekognitionModule {}
