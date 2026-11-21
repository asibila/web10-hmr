import { Controller, Get } from '@nestjs/common';
import type { HealthStatus } from '@web10/shared';
import { DatabaseService } from './database/database.service';
import { OpenCodeService } from './opencode/opencode.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly opencode: OpenCodeService,
    private readonly database: DatabaseService,
  ) {}

  @Get()
  async health(): Promise<HealthStatus> {
    const [opencode, database] = await Promise.all([
      this.opencode.health(),
      this.database.health(),
    ]);

    return {
      status: 'ok',
      service: 'web10-api',
      opencode,
      database,
    };
  }
}
