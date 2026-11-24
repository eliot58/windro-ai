import { PromptKey } from './prompts.constants';

export interface PromptView {
  key: PromptKey;
  title: string;
  text: string;
  isDefault: boolean;
  updatedAt?: string;
}
