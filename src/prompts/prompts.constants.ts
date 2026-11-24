import {
  DOCUMENT_PROMPT,
  PHOTO_PROMPT,
} from '../recognition/constants/recognition.constants';

export const PROMPT_KEYS = ['photo', 'document'] as const;
export type PromptKey = (typeof PROMPT_KEYS)[number];

export const isPromptKey = (key: string): key is PromptKey =>
  (PROMPT_KEYS as readonly string[]).includes(key);

export const DEFAULT_PROMPTS: Record<PromptKey, string> = {
  photo: PHOTO_PROMPT,
  document: DOCUMENT_PROMPT,
};

export const PROMPT_TITLES: Record<PromptKey, string> = {
  photo: 'Фото рукописных бланков',
  document: 'Документы PDF, DOC, DOCX',
};

export const MAX_PROMPT_LENGTH = 200_000;
