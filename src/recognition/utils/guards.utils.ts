import { Obj } from '../recognition.types';

export const isObject = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
