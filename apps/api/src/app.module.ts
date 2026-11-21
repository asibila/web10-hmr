import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { JobsModule } from './jobs/jobs.module';
import { OpenCodeModule } from './opencode/opencode.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    OpenCodeModule,
    JobsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
