import { createHash, timingSafeEqual } from 'node:crypto';

import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';

import appConfig from '../../config/app.config';
import { API_KEY_HEADER, INVALID_API_KEY_MESSAGE } from '../common.constants';
import { ApiException } from '../exceptions/api.exception';

const digest = (value: string) => createHash('sha256').update(value).digest();

// Сравниваем хэши: timingSafeEqual требует одинаковую длину и не выдаёт ключ по времени ответа
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const key = request.headers[API_KEY_HEADER];

    if (
      typeof key === 'string' &&
      timingSafeEqual(digest(key), digest(this.config.apiKey))
    ) {
      return true;
    }
    throw new ApiException(401, {
      code: 'invalid_api_key',
      message: INVALID_API_KEY_MESSAGE,
    });
  }
}
