import { extname } from 'node:path';

import { Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import {
  API_KEY_SECURITY,
  DOCUMENT_EXTENSIONS,
  FILE_TOO_LARGE_MESSAGE,
  IMAGE_EXTENSIONS,
  MAX_FILE_SIZE,
} from '../common/common.constants';
import { ApiErrorResponse } from '../common/decorators/api-responses.decorator';
import { ApiException } from '../common/exceptions/api.exception';
import { readForm } from '../common/form-reader';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { OrderFile } from '../recognition/recognition.types';
import {
  RecognitionAcceptedDto,
  RecognitionCompletedDto,
  RecognitionFailedDto,
  RecognitionUploadDto,
} from './dtos/recognition.dto';
import {
  BAD_CALLBACK_URL_MESSAGE,
  FILE_REQUIRED_MESSAGE,
  MIME_EXTENSIONS,
  UNSUPPORTED_FORMAT_MESSAGE,
} from './order-requests.constants';
import { OrderRequestsService } from './order-requests.service';

const DESCRIPTION = `
Принимает заявку и сразу отвечает **202** с \`request_id\`. Распознавание идёт в фоне, обычно 20–60 секунд.

Когда результат готов, мы отправляем **POST** с JSON на \`callback_url\`:

- успех — \`RecognitionCompletedDto\`: \`{ request_id, status: "completed", orderItems, addOrderitems? }\`
- ошибка — \`RecognitionFailedDto\`: \`{ request_id, status: "error", error_type, message }\`

Тип файла определяется по расширению имени, а если его нет — по Content-Type части \`file\`.
`.trim();

@ApiTags('Распознавание')
@ApiSecurity(API_KEY_SECURITY)
@ApiExtraModels(RecognitionCompletedDto, RecognitionFailedDto)
@UseGuards(ApiKeyGuard)
@Controller('recognitions')
export class RecognitionsController {
  constructor(private readonly orderRequests: OrderRequestsService) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({ summary: 'Распознать заявку', description: DESCRIPTION })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: RecognitionUploadDto })
  @ApiResponse({
    status: 202,
    description: 'Заявка принята, результат придёт на callback_url',
    type: RecognitionAcceptedDto,
  })
  @ApiErrorResponse(
    400,
    'Коды: multipart_required, file_required, unsupported_format, file_too_large, invalid_callback_url',
  )
  @ApiErrorResponse(
    401,
    'Код invalid_api_key: нет заголовка x-api-key или ключ неверен',
  )
  async recognize(
    @Req() request: FastifyRequest,
  ): Promise<RecognitionAcceptedDto> {
    const { fields, file } = await readForm(request);
    if (!file) {
      throw new ApiException(400, {
        code: 'file_required',
        message: FILE_REQUIRED_MESSAGE,
      });
    }

    const orderFile = toOrderFile(file.name, file.mimeType, file.content);
    if (!orderFile) {
      throw new ApiException(400, {
        code: 'unsupported_format',
        message: UNSUPPORTED_FORMAT_MESSAGE,
      });
    }
    if (file.content.length > MAX_FILE_SIZE) {
      throw new ApiException(400, {
        code: 'file_too_large',
        message: FILE_TOO_LARGE_MESSAGE,
      });
    }

    const callbackUrl = fields.callback_url ?? '';
    if (!/^https?:\/\//.test(callbackUrl)) {
      throw new ApiException(400, {
        code: 'invalid_callback_url',
        message: BAD_CALLBACK_URL_MESSAGE,
      });
    }

    const requestId = this.orderRequests.accept({
      file: orderFile,
      callbackUrl,
    });
    return { status: 'accepted', request_id: requestId };
  }
}

function toOrderFile(
  name: string,
  mimeType: string,
  content: Buffer,
): OrderFile | null {
  const known = [...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS];
  let extension = extname(name).toLowerCase();
  if (!known.includes(extension)) extension = MIME_EXTENSIONS[mimeType] ?? '';

  if (IMAGE_EXTENSIONS.includes(extension)) return { kind: 'photo', content };
  if (DOCUMENT_EXTENSIONS.includes(extension)) {
    return { kind: 'document', extension, content };
  }
  return null;
}
