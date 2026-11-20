import { Controller, Get } from '@nestjs/common';
import type { HealthStatus } from '@web10/shared';
import { OpenCodeService } from './opencode/opencode.service';

@Controller('health')
export class HealthController {
  constructor(private readonly opencode: OpenCodeService) {}

  @Get()
  async health(): Promise<HealthStatus> {
    return {
      status: 'ok',
      service: 'web10-api',
      opencode: await this.opencode.health(),
    };
  }
}
