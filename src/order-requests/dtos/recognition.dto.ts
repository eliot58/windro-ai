import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const REQUEST_ID = '0335c1af-9c52-4680-a80c-6933b76fada6';

export class RecognitionUploadDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description:
      'Заявка: PDF, DOC, DOCX или фото бланка JPG, PNG, WEBP. До 20 МБ',
  })
  file: unknown;

  @ApiProperty({
    example: 'https://dev.example.com/callbackRecognition',
    description: 'Куда прислать результат распознавания',
  })
  callback_url: string;

  @ApiPropertyOptional({
    example: '1234-5678',
    description:
      'Код продавца. Для распознавания не нужен, можно не передавать',
  })
  seller_code?: string;
}

export class RecognitionAcceptedDto {
  @ApiProperty({ example: 'accepted' })
  status: 'accepted';

  @ApiProperty({
    example: REQUEST_ID,
    description: 'Этот же request_id придёт в ответе на callback_url',
  })
  request_id: string;
}

export class RecognitionCompletedDto {
  @ApiProperty({ example: REQUEST_ID })
  request_id: string;

  @ApiProperty({ example: 'completed' })
  status: 'completed';

  @ApiProperty({
    example: 'Позиция 1: высота изменена с 3140 на 3000',
    description:
      'Комментарий для менеджера: что изменено относительно заявки. Пункты через «; », номер позиции считается с 1 по orderItems. Нет замечаний — пустая строка',
  })
  cloud: string;

  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description: [
      'Изделия: окна и двери с размерами, импостами и створками.',
      'У входной двери furnitureName всегда «Фурнитура Дверная», а в stvorka.parameters ровно шесть',
      'пунктов {name, value} в этом порядке: Тип дверной ручки, Замок, Цилиндр, Петли,',
      'Количество петель, Доводчик. constructionType: «Дверь входная открывание наружу»',
      'или «Дверь входная открывание во внутрь».',
    ].join(' '),
    example: [
      {
        constructionType: 'Окно',
        profileName: 'Rehau 70',
        furnitureName: 'ROTO',
        fill: '4-16-4',
        qu: 1,
        width: 1300,
        height: 1400,
        colorIn: 'W',
        colorOut: 'W',
        vImposts: [
          {
            x: 650,
            rightStvorka: { openType: 'povOtk', openSide: 'right' },
          },
        ],
      },
    ],
  })
  orderItems: object[];

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'object' },
    description:
      'Дополнительные изделия: подоконники, отливы. Если поля нет, допов нет',
    example: [{ name: 'Подоконник', qu: 1, thick: 1500, width: 250 }],
  })
  addOrderitems?: object[];
}

export class RecognitionFailedDto {
  @ApiProperty({ example: REQUEST_ID })
  request_id: string;

  @ApiProperty({ example: 'error' })
  status: 'error';

  @ApiProperty({
    enum: ['pipeline_error', 'internal_error'],
    description:
      'pipeline_error — в файле не нашлось заявки, internal_error — сбой на нашей стороне',
  })
  error_type: string;

  @ApiProperty({
    example: 'Не удалось распознать заявку: изделия не найдены.',
  })
  message: string;
}
