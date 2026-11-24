import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_PROMPTS,
  isPromptKey,
  PROMPT_KEYS,
  PROMPT_TITLES,
  PromptKey,
} from './prompts.constants';
import { PromptView } from './prompts.types';

interface StoredPrompt {
  text: string;
  updatedAt: Date;
}

const normalize = (text: string) => text.replace(/\r\n/g, '\n').trim();

// Промпт из файла действует, пока его не изменили на странице. Изменения
// хранятся в базе и переживают деплой, в памяти лежит их копия для распознавания
@Injectable()
export class PromptsService implements OnModuleInit {
  private readonly logger = new Logger(PromptsService.name);
  private readonly overrides = new Map<PromptKey, StoredPrompt>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const rows = await this.prisma.prompt.findMany();
    for (const row of rows) {
      if (isPromptKey(row.key)) this.overrides.set(row.key, row);
    }
  }

  get(key: PromptKey): string {
    return this.overrides.get(key)?.text ?? DEFAULT_PROMPTS[key];
  }

  list(): PromptView[] {
    return PROMPT_KEYS.map((key) => {
      const override = this.overrides.get(key);
      return {
        key,
        title: PROMPT_TITLES[key],
        text: this.get(key),
        isDefault: !override,
        updatedAt: override?.updatedAt.toLocaleString('ru-RU', {
          timeZone: 'Europe/Moscow',
        }),
      };
    });
  }

  async update(key: PromptKey, raw: string) {
    const text = normalize(raw);
    if (text === normalize(DEFAULT_PROMPTS[key])) return this.reset(key);

    const row = await this.prisma.prompt.upsert({
      where: { key },
      create: { key, text },
      update: { text },
    });
    this.overrides.set(key, row);
    this.logger.log(`Промпт ${key} изменён, символов: ${text.length}`);
  }

  async reset(key: PromptKey) {
    await this.prisma.prompt.deleteMany({ where: { key } });
    this.overrides.delete(key);
    this.logger.log(`Промпт ${key} возвращён к файлу`);
  }
}
