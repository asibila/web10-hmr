import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CaptureJobResult,
  JobPosting,
  JobSearchParams,
  JobSearchResult,
} from '@web10/shared';
import { OpenCodeService } from '../opencode/opencode.service';
import { CaptureJobDto } from './dto/capture-job.dto';
import { parseJsonObject } from './json';
import { normalizeJob } from './jobs.normalize';
import { buildJobPrompt } from './jobs.prompt';
import { JobsRepository } from './jobs.repository';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private readonly maxContentChars: number;
  private readonly maxJsonLdChars: number;

  constructor(
    private readonly opencode: OpenCodeService,
    private readonly repository: JobsRepository,
    config: ConfigService,
  ) {
    const contentLimit = Number(
      config.get<string>('OPENCODE_MAX_CONTENT_CHARS', '30000'),
    );
    const jsonLdLimit = Number(
      config.get<string>('OPENCODE_MAX_JSONLD_CHARS', '30000'),
    );

    this.maxContentChars =
      Number.isFinite(contentLimit) && contentLimit > 0
        ? contentLimit
        : 30000;
    this.maxJsonLdChars =
      Number.isFinite(jsonLdLimit) && jsonLdLimit > 0 ? jsonLdLimit : 30000;
  }

  async capture(input: CaptureJobDto): Promise<CaptureJobResult> {
    const prompt = buildJobPrompt(
      input,
      this.maxContentChars,
      this.maxJsonLdChars,
    );

    const started = Date.now();
    const output = await this.opencode.generateText(prompt);

    let job: JobPosting | null;

    try {
      job = normalizeJob(parseJsonObject(output), input);
    } catch (error) {
      this.logger.error(
        `Could not parse OpenCode job extraction: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      throw new BadGatewayException(
        'OpenCode returned a response that was not valid job JSON.',
      );
    }

    if (!job) {
      throw new BadRequestException(
        'This page does not appear to be a job posting. Open an individual job ad and try again.',
      );
    }

    const result = await this.repository.upsert(job);

    this.logger.log(
      `${result.duplicate ? 'Refreshed' : 'Captured'} "${job.title}" at ${
        job.company ?? job.source
      } in ${Date.now() - started}ms`,
    );

    return result;
  }

  search(params: JobSearchParams): Promise<JobSearchResult> {
    return this.repository.search(params);
  }

  async findOne(id: string): Promise<JobPosting> {
    const job = await this.repository.findById(id);

    if (!job) {
      throw new NotFoundException('Job not found.');
    }

    return job;
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.repository.delete(id);

    if (!deleted) {
      throw new NotFoundException('Job not found.');
    }
  }
}
