import { Body, Controller, Post } from '@nestjs/common';
import type { ClassificationResult } from '@web10/shared';
import { ClassificationService } from './classification.service';
import { ClassifyPageDto } from './dto/classify-page.dto';

@Controller('classify')
export class ClassificationController {
  constructor(
    private readonly classificationService: ClassificationService,
  ) {}

  @Post()
  classify(@Body() dto: ClassifyPageDto): Promise<ClassificationResult> {
    return this.classificationService.classify(dto);
  }
}
