import { HttpException } from '@nestjs/common';

import { ApiExceptionBody } from './api-exception.types';

// Ошибка API: code для логики клиента, message на русском для пользователя
export class ApiException extends HttpException {
  constructor(status: number, body: ApiExceptionBody) {
    super(body, status);
  }
}
