import { OPENING_CLASSES } from './constants/opening.constants';

// Произвольный JSON от модели, его форму проверяет валидатор
export type Obj = Record<string, any>;

// Изделие заказа: схема задаётся сервером КП и проверяется в order-validator.ts
export type OrderItem = Record<string, any>;

export interface AdditionalItem {
  name: string;
  qu: number;
  color?: string;
  colorIn?: string;
  colorOut?: string;
  thick?: number;
  width?: number;
}

export type OrderFileType =
  { kind: 'document'; extension: string } | { kind: 'photo' };

export type OrderFile = OrderFileType & { content: Buffer };

export interface RecognitionResult {
  orderItems: OrderItem[];
  addOrderitems: AdditionalItem[];
}

export enum DocumentType {
  Proposal = 'proposal',
  ShortProposal = 'short_proposal',
  Calculation = 'calculation',
  TechnicalSpec = 'technical_spec',
  Image = 'image',
  Unknown = 'unknown',
}

export interface DocumentBlock {
  image: Buffer;
  blockNumber: number;
  documentType: DocumentType;
  pageText: string;
}

export interface MosquitoNet {
  dims: [number, number] | null;
}

export type MosquitoNetMap = Map<number, MosquitoNet[]>;

export type Axis = 'x' | 'y';

export type Dims = [number, number];

export type Segment = [number, string];

export interface OpenStvorka {
  stvorka: Obj;
  left: number | null;
  right: number | null;
}

export type XmlNode = Record<string, any>;

export interface VisionRequest {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  images: Buffer[];
}

export interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export type Mupdf = typeof import('mupdf');

type PdfDocument = InstanceType<Mupdf['Document']>;

export type PdfPage = ReturnType<PdfDocument['loadPage']>;

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Word {
  x0: number;
  y0: number;
  text: string;
}

export interface ReadDocument {
  blocks: DocumentBlock[];
  fullText: string;
  pageTexts: string[];
}

export interface Candidate {
  raw: Record<string, unknown>;
  items: OrderItem[];
  errors: string[];
}

export type OpeningClass = (typeof OPENING_CLASSES)[number];

export interface OpeningPrediction {
  name: OpeningClass;
  confidence: number;
}

export interface PixelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RawImage {
  data: Buffer;
  width: number;
  height: number;
}

// Секция изделия в миллиметрах, y отсчитывается от низа
export interface OpeningSlot {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  // Где лежит створка секции; без owner секцию можно только проверить
  owner?: Obj;
  key?: string;
  stvorka?: Obj;
}
