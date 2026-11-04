import { Api } from 'grammy';

import { OrderFileType } from '../recognition/recognition.types';

export interface OrderJob {
  api: Api;
  chatId: number;
  sellerCode: string;
  fileId: string;
  fileName: string;
  fileType: OrderFileType;
}
