import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ClassificationResult,
  EntityClassification,
} from '@web10/shared';
import { OpenCodeService } from '../opencode/opencode.service';
import { buildClassificationPrompt } from './classification.prompt';
import { ClassifyPageDto } from './dto/classify-page.dto';
import { parseJsonObject } from './json';
import { normalizeClassification } from './normalize';

@Injectable()
export class ClassificationService {
  private readonly logger = new Logger(ClassificationService.name);
  private readonly maxContentChars: number;
  private readonly maxJsonLdChars: number;

  constructor(
    private readonly opencode: OpenCodeService,
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

  async classify(input: ClassifyPageDto): Promise<ClassificationResult> {
    const prompt = buildClassificationPrompt(
      input,
      this.maxContentChars,
      this.maxJsonLdChars,
    );

    const started = Date.now();
    const output = await this.opencode.generateText(prompt);

    let entity: EntityClassification;

    try {
      entity = normalizeClassification(parseJsonObject(output));
    } catch (error) {
      this.logger.error(
        `Could not parse OpenCode classification output: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      throw new BadGatewayException(
        'OpenCode returned a response that was not valid classification JSON.',
      );
    }

    this.logger.log(
      `Classified ${input.url} as ${entity.category}/${entity.subcategory} in ${
        Date.now() - started
      }ms`,
    );

    return { entity };
  }
}
