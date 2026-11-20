import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OpenCodeHealth } from '@web10/shared';
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';

interface GenerateTextResponse {
  data: {
    text: string;
  };
}

interface ServerInfo {
  version?: string;
}

@Injectable()
export class OpenCodeService {
  private readonly logger = new Logger(OpenCodeService.name);
  private readonly http: AxiosInstance;
  private readonly baseUrl: string;
  private readonly authHeader?: string;
  private readonly model?: {
    providerID: string;
    id: string;
    variant?: string;
  };
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.baseUrl = config
      .get<string>('OPENCODE_BASE_URL', 'http://127.0.0.1:4096')
      .replace(/\/+$/, '');

    const username = config.get<string>('OPENCODE_USERNAME', 'opencode');
    const password = config.get<string>('OPENCODE_PASSWORD', '');
    this.authHeader = password
      ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
      : undefined;

    const providerID = config.get<string>(
      'OPENCODE_MODEL_PROVIDER_ID',
      'opencode-go',
    );
    const id = config.get<string>(
      'OPENCODE_MODEL_ID',
      'deepseek-v4.1-flash',
    );
    const variant = config.get<string>('OPENCODE_MODEL_VARIANT', 'low');
    this.model =
      providerID && id
        ? { providerID, id, ...(variant ? { variant } : {}) }
        : undefined;

    const configuredTimeout = Number(
      config.get<string>('OPENCODE_TIMEOUT_MS', '180000'),
    );
    this.timeoutMs =
      Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : 180000;

    this.http = axios.create();
  }

  async generateText(prompt: string): Promise<string> {
    const started = Date.now();

    try {
      const { data } = await this.http.post<GenerateTextResponse>(
        `${this.baseUrl}/api/experimental/generate/text`,
        {
          prompt,
          ...(this.model ? { model: this.model } : {}),
        },
        this.requestConfig(),
      );

      if (!data?.data?.text) {
        throw new BadGatewayException(
          'OpenCode returned an empty generation response.',
        );
      }

      this.logger.log(
        `OpenCode generation completed in ${Date.now() - started}ms`,
      );
      return data.data.text;
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  async health(): Promise<OpenCodeHealth> {
    try {
      const { data } = await this.http.get<ServerInfo>(
        `${this.baseUrl}/api/info`,
        {
          ...this.requestConfig(),
          timeout: Math.min(this.timeoutMs, 5000),
        },
      );

      return { ok: true, url: this.baseUrl, version: data?.version };
    } catch (error) {
      return {
        ok: false,
        url: this.baseUrl,
        error: this.describeError(error),
      };
    }
  }

  private requestConfig(): AxiosRequestConfig {
    return {
      headers: {
        'content-type': 'application/json',
        ...(this.authHeader ? { authorization: this.authHeader } : {}),
      },
      timeout: this.timeoutMs,
    };
  }

  private toHttpException(error: unknown): HttpException {
    const message = this.describeError(error);

    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return new GatewayTimeoutException(
          'OpenCode did not respond before the timeout.',
        );
      }

      const status = error.response?.status;

      if (status === 401) {
        return new UnauthorizedException(
          'OpenCode authentication failed. Check OPENCODE_USERNAME and OPENCODE_PASSWORD.',
        );
      }

      if (status === 429) {
        return new ServiceUnavailableException(
          `OpenCode rate limit reached: ${message}`,
        );
      }

      if (!error.response) {
        return new BadGatewayException(
          `Cannot reach OpenCode at ${this.baseUrl}: ${message}`,
        );
      }

      return new BadGatewayException(
        `OpenCode request failed with status ${status}: ${message}`,
      );
    }

    this.logger.error(message);
    return new BadGatewayException(
      error instanceof Error ? error.message : 'Unknown OpenCode error.',
    );
  }

  private describeError(error: unknown): string {
    if (axios.isAxiosError(error)) {
      return this.upstreamMessage(error);
    }

    return error instanceof Error ? error.message : String(error);
  }

  private upstreamMessage(error: AxiosError): string {
    const data: unknown = error.response?.data;

    if (typeof data === 'string') {
      return data.slice(0, 500);
    }

    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      const message = record.message ?? record.error ?? record._tag;

      if (typeof message === 'string') {
        return message.slice(0, 500);
      }

      try {
        return JSON.stringify(data).slice(0, 500);
      } catch {
        return error.message;
      }
    }

    return error.message;
  }
}
