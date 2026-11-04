import { applyDecorators, HttpCode, Type } from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';

import { ApiErrorResponse } from '../common/decorators/api-responses.decorator';
import { OrderAcceptedDto } from './dtos/order-response.dto';

const CALLBACK_NOTE =
  'Запрос принимается сразу, результат приходит POST-запросом на callbackUrl (схема OrderCallbackDto).';

// Общее описание эндпойнтов приёма файла
export const ApiOrderUpload = (summary: string, body: Type<unknown>) =>
  applyDecorators(
    HttpCode(202),
    ApiOperation({ summary, description: CALLBACK_NOTE }),
    ApiConsumes('multipart/form-data'),
    ApiBody({ type: body }),
    ApiResponse({
      status: 202,
      description: 'Файл принят в обработку',
      type: OrderAcceptedDto,
    }),
    ApiErrorResponse(
      400,
      'Коды: multipart_required, file_required, unsupported_format, file_too_large, invalid_callback_url',
    ),
  );
