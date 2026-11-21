import {
  EMPLOYMENT_TYPES,
  JOB_SORTS,
  MAX_PAGE_SIZE,
  SENIORITY_LEVELS,
  WORK_MODES,
  type EmploymentType,
  type JobSearchParams,
  type JobSort,
  type SeniorityLevel,
  type WorkMode,
} from '@web10/shared';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

function toBoolean({ value }: { value: unknown }): boolean {
  return (
    value === true ||
    value === 'true' ||
    value === '1' ||
    value === 'yes' ||
    value === 'on'
  );
}

/** Query-string validation for `GET /api/jobs`. */
export class SearchJobsDto implements JobSearchParams {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsIn([...WORK_MODES])
  workMode?: WorkMode;

  @IsOptional()
  @IsIn([...EMPLOYMENT_TYPES])
  employmentType?: EmploymentType;

  @IsOptional()
  @IsIn([...SENIORITY_LEVELS])
  seniority?: SeniorityLevel;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minSalary?: number;

  @IsOptional()
  @IsIn([...JOB_SORTS])
  sort?: JobSort;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeInactive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
