import { ApiProperty } from '@nestjs/swagger';

export class ApiErrorDto {
  @ApiProperty({
    example: 'unsupported_format',
    description: 'Код ошибки для логики клиента',
  })
  code: string;

  @ApiProperty({
    example: 'Формат не поддерживается. Нужен PDF, DOCX или DOC.',
    description: 'Текст для пользователя',
  })
  message: string;
}
