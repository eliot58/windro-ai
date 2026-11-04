import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class OrderUploadDto {
  @ApiProperty({
    example: 'https://your-site.com/callback',
    description: 'Адрес, на который придёт результат',
  })
  callbackUrl: string;

  @ApiPropertyOptional({
    example: '1234-5678',
    description: 'Код продавца для сервера КП',
  })
  sellerCode?: string;
}

export class OrderDocumentUploadDto extends OrderUploadDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'PDF, DOCX или DOC, до 20 МБ',
  })
  file: unknown;
}

export class OrderPhotoUploadDto extends OrderUploadDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'JPG, PNG, BMP или WEBP, до 20 МБ',
  })
  file: unknown;
}
