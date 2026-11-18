import { OrderFile } from '../recognition/recognition.types';

export interface RecognitionInput {
  file: OrderFile;
  callbackUrl: string;
}

export type RecognitionErrorType = 'pipeline_error' | 'internal_error';
