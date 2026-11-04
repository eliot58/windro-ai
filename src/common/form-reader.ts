import '@fastify/multipart';

import type { FastifyRequest } from 'fastify';

import { FILE_TOO_LARGE_MESSAGE } from './common.constants';
import { SubmittedForm } from './common.types';
import { ApiException } from './exceptions/api.exception';

const isFileTooLarge = (error: unknown) =>
  (error as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE';

export async function readForm(
  request: FastifyRequest,
): Promise<SubmittedForm> {
  if (!request.isMultipart()) {
    throw new ApiException(400, {
      code: 'multipart_required',
      message: 'Запрос должен быть в формате multipart/form-data.',
    });
  }

  const form: SubmittedForm = { fields: {} };
  try {
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        form.file = { name: part.filename, content: await part.toBuffer() };
      } else {
        form.fields[part.fieldname] = String(part.value);
      }
    }
  } catch (error) {
    if (!isFileTooLarge(error)) throw error;
    throw new ApiException(400, {
      code: 'file_too_large',
      message: FILE_TOO_LARGE_MESSAGE,
    });
  }
  return form;
}
