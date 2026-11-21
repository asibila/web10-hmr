import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import type {
  CaptureJobResult,
  JobPosting,
  JobSearchResult,
} from '@web10/shared';
import { CaptureJobDto } from './dto/capture-job.dto';
import { SearchJobsDto } from './dto/search-jobs.dto';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  search(@Query() query: SearchJobsDto): Promise<JobSearchResult> {
    return this.jobs.search(query);
  }

  @Get(':id')
  get(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<JobPosting> {
    return this.jobs.findOne(id);
  }

  @Post()
  capture(@Body() dto: CaptureJobDto): Promise<CaptureJobResult> {
    return this.jobs.capture(dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    await this.jobs.remove(id);
  }
}
