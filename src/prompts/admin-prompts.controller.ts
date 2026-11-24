import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Redirect,
  Render,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { API_PREFIX } from '../app.constants';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import {
  isPromptKey,
  MAX_PROMPT_LENGTH,
  PROMPT_TITLES,
  PromptKey,
} from './prompts.constants';
import { PromptsService } from './prompts.service';

const PAGE = `/${API_PREFIX}/admin/prompts`;

function toKey(key: string): PromptKey {
  if (!isPromptKey(key)) throw new BadRequestException('Неизвестный промпт');
  return key;
}

// Страница для людей: показывает действующие промпты и позволяет их поменять.
// После сохранения новый промпт сразу используется в распознавании
@ApiExcludeController()
@UseGuards(AdminAuthGuard)
@Controller('admin/prompts')
export class AdminPromptsController {
  constructor(private readonly prompts: PromptsService) {}

  @Get()
  @Render('prompts')
  page(@Query('saved') saved?: string, @Query('reset') reset?: string) {
    const key = saved ?? reset;
    return {
      prompts: this.prompts
        .list()
        .map((prompt) => ({ ...prompt, action: `${PAGE}/${prompt.key}` })),
      notice:
        key && isPromptKey(key)
          ? `${PROMPT_TITLES[key]}: ${saved ? 'промпт сохранён' : 'возвращён промпт из файла'}`
          : undefined,
    };
  }

  @Post(':key')
  @Redirect(PAGE, 303)
  async save(@Param('key') key: string, @Body() body: { text?: string }) {
    const promptKey = toKey(key);
    const text = typeof body?.text === 'string' ? body.text : '';
    if (!text.trim())
      throw new BadRequestException('Промпт не может быть пустым');
    if (text.length > MAX_PROMPT_LENGTH) {
      throw new BadRequestException('Промпт слишком длинный');
    }
    await this.prompts.update(promptKey, text);
    return { url: `${PAGE}?saved=${promptKey}` };
  }

  @Post(':key/reset')
  @Redirect(PAGE, 303)
  async reset(@Param('key') key: string) {
    const promptKey = toKey(key);
    await this.prompts.reset(promptKey);
    return { url: `${PAGE}?reset=${promptKey}` };
  }
}
