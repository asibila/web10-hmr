import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClassificationModule } from './classification/classification.module';
import { HealthController } from './health.controller';
import { OpenCodeModule } from './opencode/opencode.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    OpenCodeModule,
    ClassificationModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
