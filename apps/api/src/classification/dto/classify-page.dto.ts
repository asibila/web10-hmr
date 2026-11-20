import type { ClassifyPageInput } from '@web10/shared';
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Runtime validation for `ClassifyPageInput`. The `implements` clause keeps this
 * class and the shared contract from drifting apart.
 */
export class ClassifyPageDto implements ClassifyPageInput {
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  url: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  title?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200_000)
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  html?: string;

  @IsOptional()
  @IsArray()
  jsonLd?: unknown[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  capturedAt?: string;
}
