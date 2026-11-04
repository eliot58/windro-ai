import {
  AdditionalItem,
  OrderFile,
  OrderItem,
  RecognitionResult,
} from '../recognition/recognition.types';

export interface OrderRequest {
  callbackUrl: string;
  sellerCode: string;
  createdAt: number;
  orderItems: OrderItem[];
  addOrderitems: AdditionalItem[];
}

export interface OrderInput {
  file: OrderFile;
  callbackUrl: string;
  sellerCode: string;
}

export type RecognizedHandler = (
  requestId: string,
  result: RecognitionResult,
) => Promise<void>;
