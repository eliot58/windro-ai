import { ApiResponse } from '@nestjs/swagger';

import { ApiErrorDto } from '../dtos/api-error.dto';

export const ApiErrorResponse = (status: number, description: string) =>
  ApiResponse({ status, description, type: ApiErrorDto });
