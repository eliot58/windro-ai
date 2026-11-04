import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const REQUEST_ID_EXAMPLE = '0335c1af-9c52-4680-a80c-6933b76fada6';

export class OrderAcceptedDto {
  @ApiProperty({ example: REQUEST_ID_EXAMPLE })
  requestId: string;
}

export class OrderStatusDto {
  @ApiProperty({ example: REQUEST_ID_EXAMPLE })
  requestId: string;

  @ApiProperty({ enum: ['processing'] })
  status: 'processing';

  @ApiProperty({ description: 'Распознавание уже завершено' })
  hasOrderItems: boolean;
}

// Тело POST-запроса на callbackUrl. С готовым КП оно приходит как
// multipart/form-data: orderItems и addOrderitems строками JSON, PDF в поле file
export class OrderCallbackDto {
  @ApiProperty({ example: REQUEST_ID_EXAMPLE })
  requestId: string;

  @ApiProperty({ enum: ['completed', 'error'] })
  status: 'completed' | 'error';

  @ApiPropertyOptional({ type: 'array', items: { type: 'object' } })
  orderItems?: object[];

  @ApiPropertyOptional({ type: 'array', items: { type: 'object' } })
  addOrderitems?: object[];

  @ApiPropertyOptional({
    enum: [
      'pipeline_error',
      'kp_server_error',
      'kp_generation_error',
      'internal_error',
    ],
  })
  errorType?: string;

  @ApiPropertyOptional()
  message?: string;
}
