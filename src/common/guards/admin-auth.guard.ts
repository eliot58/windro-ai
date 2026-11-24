import { createHash, timingSafeEqual } from 'node:crypto';

import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';

import appConfig from '../../config/app.config';

const digest = (value: string) => createHash('sha256').update(value).digest();

// Страницы для людей открываются в браузере, поэтому вместо x-api-key —
// стандартное окно входа браузера (Basic). Логин любой, важен только пароль
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const password = this.config.adminPassword;
    if (!password) throw new NotFoundException();

    const http = context.switchToHttp();
    const header = http.getRequest<FastifyRequest>().headers.authorization;
    if (header?.startsWith('Basic ')) {
      const decoded = Buffer.from(header.slice(6), 'base64').toString();
      const given = decoded.slice(decoded.indexOf(':') + 1);
      if (timingSafeEqual(digest(given), digest(password))) return true;
    }

    http
      .getResponse<FastifyReply>()
      .header('WWW-Authenticate', 'Basic realm="Windro", charset="UTF-8"');
    throw new UnauthorizedException();
  }
}
