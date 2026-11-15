import { extname } from 'node:path';

import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { ApiErrorResponse } from '../common/decorators/api-responses.decorator';
import {
  API_KEY_SECURITY,
  DOCUMENT_EXTENSIONS,
  IMAGE_EXTENSIONS,
  MAX_FILE_SIZE,
  FILE_TOO_LARGE_MESSAGE,
} from '../common/common.constants';
import { ApiException } from '../common/exceptions/api.exception';
import { readForm } from '../common/form-reader';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { OrderFile } from '../recognition/recognition.types';
import {
  OrderAcceptedDto,
  OrderCallbackDto,
  OrderStatusDto,
} from './dtos/order-response.dto';
import {
  OrderDocumentUploadDto,
  OrderPhotoUploadDto,
} from './dtos/order-upload.dto';
import {
  BAD_CALLBACK_URL_MESSAGE,
  DOCUMENT_FORMAT_MESSAGE,
  FILE_REQUIRED_MESSAGE,
  PHOTO_FORMAT_MESSAGE,
  REQUEST_NOT_FOUND_MESSAGE,
} from './order-requests.constants';
import { ApiOrderUpload } from './order-requests.decorators';
import { OrderRequestsService } from './order-requests.service';
import { OrderInput } from './order-requests.types';

@ApiTags('Orders')
@ApiSecurity(API_KEY_SECURITY)
@ApiErrorResponse(
  401,
  'Код invalid_api_key: нет заголовка x-api-key или ключ неверен',
)
@ApiExtraModels(OrderCallbackDto)
@UseGuards(ApiKeyGuard)
@Controller('orders')
export class OrderRequestsController {
  constructor(private readonly orderRequests: OrderRequestsService) {}

  @Post('proposal/document')
  @ApiOrderUpload('Документ: распознать и заказать КП', OrderDocumentUploadDto)
  async proposalFromDocument(
    @Req() request: FastifyRequest,
  ): Promise<OrderAcceptedDto> {
    const input = await this.readUpload(request, 'document');
    return { requestId: this.orderRequests.acceptProposal(input) };
  }

  @Post('proposal/photo')
  @ApiOrderUpload('Фото бланка: распознать и заказать КП', OrderPhotoUploadDto)
  async proposalFromPhoto(
    @Req() request: FastifyRequest,
  ): Promise<OrderAcceptedDto> {
    const input = await this.readUpload(request, 'photo');
    return { requestId: this.orderRequests.acceptProposal(input) };
  }

  @Post('recognize/document')
  @ApiOrderUpload('Документ: только распознать', OrderDocumentUploadDto)
  async recognizeDocument(
    @Req() request: FastifyRequest,
  ): Promise<OrderAcceptedDto> {
    const input = await this.readUpload(request, 'document');
    return { requestId: this.orderRequests.acceptRecognition(input) };
  }

  @Post('recognize/photo')
  @ApiOrderUpload('Фото бланка: только распознать', OrderPhotoUploadDto)
  async recognizePhoto(
    @Req() request: FastifyRequest,
  ): Promise<OrderAcceptedDto> {
    const input = await this.readUpload(request, 'photo');
    return { requestId: this.orderRequests.acceptRecognition(input) };
  }

  @Get(':requestId')
  @ApiOperation({ summary: 'Статус запроса в обработке' })
  @ApiResponse({ status: 200, type: OrderStatusDto })
  @ApiErrorResponse(
    404,
    'Код request_not_found: запрос завершён, истёк или не существует',
  )
  status(@Param('requestId') requestId: string): OrderStatusDto {
    const request = this.orderRequests.get(requestId);
    if (!request) {
      throw new ApiException(404, {
        code: 'request_not_found',
        message: REQUEST_NOT_FOUND_MESSAGE,
      });
    }

    return {
      requestId,
      status: 'processing',
      hasOrderItems: request.orderItems.length > 0,
    };
  }

  private async readUpload(
    request: FastifyRequest,
    kind: OrderFile['kind'],
  ): Promise<OrderInput> {
    const { fields, file } = await readForm(request);
    const callbackUrl = fields.callbackUrl ?? '';
    const isPhoto = kind === 'photo';

    if (!file) {
      throw new ApiException(400, {
        code: 'file_required',
        message: FILE_REQUIRED_MESSAGE,
      });
    }
    const extension = extname(file.name).toLowerCase();
    const extensions = isPhoto ? IMAGE_EXTENSIONS : DOCUMENT_EXTENSIONS;
    if (!extensions.includes(extension)) {
      throw new ApiException(400, {
        code: 'unsupported_format',
        message: isPhoto ? PHOTO_FORMAT_MESSAGE : DOCUMENT_FORMAT_MESSAGE,
      });
    }
    if (file.content.length > MAX_FILE_SIZE) {
      throw new ApiException(400, {
        code: 'file_too_large',
        message: FILE_TOO_LARGE_MESSAGE,
      });
    }
    if (!/^https?:\/\//.test(callbackUrl)) {
      throw new ApiException(400, {
        code: 'invalid_callback_url',
        message: BAD_CALLBACK_URL_MESSAGE,
      });
    }

    return {
      file: isPhoto
        ? { kind, content: file.content }
        : { kind: 'document', extension, content: file.content },
      callbackUrl,
      sellerCode: fields.sellerCode ?? '',
    };
  }
}
