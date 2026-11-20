import { Global, Module } from '@nestjs/common';
import { OpenCodeService } from './opencode.service';

@Global()
@Module({
  providers: [OpenCodeService],
  exports: [OpenCodeService],
})
export class OpenCodeModule {}
